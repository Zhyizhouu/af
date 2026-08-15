import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../theme/af_text.dart';
import '../../theme/af_tokens.dart';
import '../../widgets/af_button.dart';
import '../../widgets/af_field.dart';
import '../../widgets/af_panel.dart';
import '../../widgets/af_scaffold.dart';
import '../calendar/calendar_provider.dart';
import '../calendar/category_provider.dart';
import '../calendar/event_category.dart';
import '../../models/proctor_session.dart';
import '../../providers/session_provider.dart';
import 'ai_api.dart';
import 'ai_proposal_card.dart';

/// reAFresh · AI — talk about what you need scheduled, and confirm what it
/// proposes.
///
/// The shape that matters is the pause in the middle. The assistant never
/// changes anything itself: it proposes, everything is shown for checking, and
/// one button commits. A model that wrote straight to a calendar would produce
/// a calendar nobody could trust, and trust is the whole point of a calendar.
/// That goes double now it can offer to delete.
///
/// Being a conversation rather than a form is what makes that pause usable.
/// A single-shot proposal you disagreed with left nothing to do but retype the
/// sentence; here the correction is the next thing you say.
class AiScreen extends ConsumerStatefulWidget {
  final AiApi? api;

  const AiScreen({super.key, this.api});

  @override
  ConsumerState<AiScreen> createState() => _AiScreenState();
}

/// How much of the calendar the assistant is shown.
///
/// A window rather than everything: a year of teaching is thousands of entries,
/// none of which would fit in a prompt, and a request is almost always about
/// the near future. Yesterday is in it because "cancel this morning's" is a
/// thing people say in the afternoon.
const _lookBack = Duration(days: 1);
const _lookAhead = Duration(days: 60);
const _maxExisting = 120;

/// One turn as it sits on screen.
///
/// Mutable, unlike most state in AF, because the two things that change after
/// a turn arrives — which proposals were dropped, and whether the rest were
/// carried out — belong to that turn rather than to the page.
class _Message {
  final String role;
  final String text;
  final List<SessionProposal> sessions;
  final List<EventProposal> events;

  /// Entries the assistant offered to delete, resolved to this app's own
  /// records the moment the answer arrived. Snapshotted rather than looked up
  /// at paint time: committing the deletion removes them from the calendar,
  /// and the transcript still has to show what was done.
  final List<AgendaEntry> removals;

  /// Indices the person dropped. Held as index sets rather than by rebuilding
  /// the lists, so dropping one cannot renumber the rest mid-review.
  final Set<int> droppedSessions = {};
  final Set<int> droppedEvents = {};
  final Set<int> droppedRemovals = {};

  /// Set once this turn was carried out. The cards stay on screen afterwards —
  /// the transcript is a record of what happened — but nothing about them can
  /// be changed or run twice.
  bool committed = false;

  /// A failure, rendered in place rather than as a banner over the page. An
  /// error that scrolls away with the turn it belongs to stays attached to the
  /// thing that caused it.
  final bool failed;

  _Message.user(this.text)
      : role = AiTurn.roleUser,
        sessions = const [],
        events = const [],
        removals = const [],
        failed = false;

  _Message.assistant(AiAnswer answer, List<AgendaEntry> agenda)
      : role = AiTurn.roleAssistant,
        text = answer.reply,
        sessions = answer.sessions,
        events = answer.events,
        // An id that resolves to nothing is dropped rather than drawn as a
        // placeholder: a delete card that cannot say what it deletes is not
        // something anybody can confirm.
        removals = [
          for (final id in answer.removals)
            ?agenda.where((entry) => entry.id == id).firstOrNull,
        ],
        failed = false;

  _Message.error(this.text)
      : role = AiTurn.roleAssistant,
        sessions = const [],
        events = const [],
        removals = const [],
        failed = true;

  bool get isUser => role == AiTurn.roleUser;

  bool get hasProposals =>
      sessions.isNotEmpty || events.isNotEmpty || removals.isNotEmpty;

  int get keptCount =>
      keptSessions.length + keptEvents.length + keptRemovals.length;

  List<SessionProposal> get keptSessions => [
        for (var i = 0; i < sessions.length; i++)
          if (!droppedSessions.contains(i)) sessions[i],
      ];

  List<EventProposal> get keptEvents => [
        for (var i = 0; i < events.length; i++)
          if (!droppedEvents.contains(i)) events[i],
      ];

  List<AgendaEntry> get keptRemovals => [
        for (var i = 0; i < removals.length; i++)
          if (!droppedRemovals.contains(i)) removals[i],
      ];

  /// What the server is told about this turn next time.
  ///
  /// Only what survived review is sent: the assistant should be working from
  /// what is still on the table, not from what was thrown out.
  AiTurn toTurn() => AiTurn(
        role: role,
        text: text,
        sessions: keptSessions,
        events: keptEvents,
        removals: [for (final entry in keptRemovals) entry.id],
        committed: committed,
      );
}

class _AiScreenState extends ConsumerState<AiScreen> {
  late final AiApi _api = widget.api ?? AiApi();
  final _prompt = TextEditingController();
  final _scroll = ScrollController();
  final _promptFocus = FocusNode();

  final _messages = <_Message>[];

  AiLimits? _limits;
  String? _limitsError;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _loadLimits();
    _promptFocus.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _prompt.dispose();
    _scroll.dispose();
    _promptFocus.dispose();
    if (widget.api == null) _api.close();
    super.dispose();
  }

  Future<void> _loadLimits() async {
    try {
      final limits = await _api.limits();
      if (mounted) setState(() => _limits = limits);
    } on AiError catch (error) {
      if (mounted) setState(() => _limitsError = error.message);
    }
  }

  // ---- actions ----

  /// The slice of the calendar the assistant is shown.
  ///
  /// [sessions] is keyed by agenda id, and exists only so a session can go out
  /// with its real fields rather than its display title — moving one means
  /// deleting it and proposing its replacement, which is impossible to build
  /// out of "UAS · Room 401".
  List<AiEntry> _calendarWindow(
    List<AgendaEntry> agenda,
    Map<String, ProctorSession> sessions,
    DateTime now,
  ) {
    final from = dayKey(now.subtract(_lookBack));
    final until = now.add(_lookAhead);

    final window = <AiEntry>[];
    for (final entry in agenda) {
      if (entry.end.isBefore(from) || entry.start.isAfter(until)) continue;

      final session =
          entry.kind == AgendaKind.session ? sessions[entry.id] : null;

      window.add(AiEntry(
        id: entry.id,
        kind: entry.kind == AgendaKind.session
            ? AiEntry.kindSession
            : AiEntry.kindEvent,
        title: entry.title,
        start: entry.start,
        end: entry.end,
        allDay: entry.allDay,
        category: entry.category?.slug ?? '',
        type: session?.type ?? '',
        room: session?.room ?? '',
        courseCode: session?.courseCode ?? '',
        courseName: session?.courseName ?? '',
        courseClass: session?.courseClass ?? '',
      ));
      if (window.length >= _maxExisting) break;
    }
    return window;
  }

  /// Every session this device knows about, keyed the way the agenda keys it.
  Map<String, ProctorSession> _sessionsById() {
    final active = ref.read(activeSessionsProvider).valueOrNull ?? const [];
    final archived = ref.read(archivedSessionsProvider).valueOrNull ?? const [];
    return {
      for (final session in [...active, ...archived])
        session.key.toString(): session,
    };
  }

  Future<void> _send() async {
    final message = _prompt.text.trim();
    if (message.isEmpty || _busy) return;

    final categories = ref.read(categoriesProvider).valueOrNull ?? const [];
    if (categories.isEmpty) {
      setState(() => _messages.add(
          _Message.error('Categories are still loading. Try again.')));
      _scrollToEnd();
      return;
    }

    final agenda = ref.read(agendaProvider).valueOrNull ?? const <AgendaEntry>[];
    final now = DateTime.now();

    // Taken before the new message is added, and skipping the failures — an
    // error bubble is this app talking to itself, not something the assistant
    // ever said.
    final history = [
      for (final m in _messages)
        if (!m.failed) m.toTurn(),
    ];

    setState(() {
      _messages.add(_Message.user(message));
      _prompt.clear();
      _busy = true;
    });
    _scrollToEnd();

    try {
      final answer = await _api.send(
        message: message,
        history: history,
        existing: _calendarWindow(agenda, _sessionsById(), now),
        // This device's clock, because "next Monday" is relative to whoever is
        // asking rather than to wherever the server runs.
        now: now,
        categories: [for (final c in categories) c.slug],
      );
      if (mounted) {
        setState(() => _messages.add(_Message.assistant(answer, agenda)));
      }
    } on AiError catch (error) {
      if (mounted) setState(() => _messages.add(_Message.error(error.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
      _scrollToEnd();
    }
  }

  /// Carries out one turn. This is the only thing in the program that changes
  /// anything.
  Future<void> _commit(_Message message) async {
    if (_busy || message.committed) return;

    final sessions = message.keptSessions;
    final events = message.keptEvents;
    final removals = message.keptRemovals;
    if (sessions.isEmpty && events.isEmpty && removals.isEmpty) return;

    setState(() => _busy = true);

    try {
      final sessionController = ref.read(sessionControllerProvider);
      for (final s in sessions) {
        // Goes through the same controller the add-session dialog uses, so a
        // session created here gets its checklist seeded and its course
        // remembered exactly as a hand-made one would.
        await sessionController.createSession(
          type: s.type,
          dateTime: s.start,
          room: s.room,
          courseCode: s.courseCode,
          courseName: s.courseName,
          courseClass: s.courseClass,
        );
      }

      final calendar = ref.read(calendarControllerProvider);
      for (final e in events) {
        await calendar.save(
          title: e.title,
          start: e.start,
          end: e.end,
          notes: e.notes,
          allDay: e.allDay,
          category: e.category,
        );
      }

      // Deliberately last. If a creation fails, nothing has been destroyed
      // yet — the person can retry the whole turn without having lost the
      // entries it was going to replace.
      for (final entry in removals) {
        if (entry.kind == AgendaKind.session) {
          await sessionController.delete(entry.id);
        } else {
          await calendar.delete(entry.id);
        }
      }

      if (!mounted) return;
      setState(() => message.committed = true);
    } catch (error) {
      if (mounted) {
        setState(() => _messages
            .add(_Message.error('Some changes could not be applied: $error')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
      _scrollToEnd();
    }
  }

  void _reset() {
    setState(() {
      _messages.clear();
      _prompt.clear();
    });
  }

  /// Keeps the newest turn in view.
  ///
  /// Deferred a frame because the message being scrolled to has only just been
  /// added to the list — its height does not exist until it has been laid out.
  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      _scroll.animateTo(
        _scroll.position.maxScrollExtent,
        // Long and eased-out rather than quick and linear: the transcript is
        // being read, and a fast jump loses the reader's place in it.
        duration: const Duration(milliseconds: 420),
        curve: Curves.easeOutCubic,
      );
    });
  }

  static String _entries(int count) =>
      '$count entr${count == 1 ? 'y' : 'ies'}';

  /// What the button offers to do, in the words of the thing it will do.
  ///
  /// Spelled out rather than counted whenever a deletion is involved: "Apply 3
  /// changes" is not something anybody should have to decode before pressing a
  /// button that destroys one of them.
  String _actionLabel(_Message message) {
    final adding = message.keptSessions.length + message.keptEvents.length;
    final deleting = message.keptRemovals.length;

    if (adding == 0 && deleting == 0) return 'Nothing left to do';
    if (deleting == 0) return 'Add $adding to my calendar';
    if (adding == 0) return 'Delete ${_entries(deleting)}';
    return 'Add $adding and delete $deleting';
  }

  /// What was done, once it has been.
  String _summarise(_Message message) {
    final sessions = message.keptSessions.length;
    final events = message.keptEvents.length;
    final removals = message.keptRemovals.length;

    final added = <String>[
      if (sessions > 0) '$sessions session${sessions == 1 ? '' : 's'}',
      if (events > 0) '$events event${events == 1 ? '' : 's'}',
    ];

    final parts = <String>[
      if (added.isNotEmpty) 'Added ${added.join(' and ')}',
      if (removals > 0) 'deleted ${_entries(removals)}',
    ];
    return '${parts.join(', ')}.';
  }

  // ---- build ----

  @override
  Widget build(BuildContext context) {
    final limits = _limits;
    final configured = limits?.configured ?? true;

    // Watched here rather than where they are used, which is inside cards that
    // do not exist yet on the first turn. Reading a provider nothing has
    // watched only starts it — the first message would find them still loading
    // and go out blind.
    final categories = ref.watch(categoriesProvider).valueOrNull ?? const [];
    ref.watch(agendaProvider);
    ref.watch(activeSessionsProvider);
    ref.watch(archivedSessionsProvider);

    return AFScaffold(
      title: 'reAFresh · AI',
      tagline: 'talk it through, then keep it',
      onBack: () => Navigator.of(context).maybePop(),
      footer: const AFFooter('Nothing changes until you confirm it.'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (limits != null && !limits.configured) ...[
            _unconfigured(),
            const SizedBox(height: 14),
          ],
          if (_limitsError != null) ...[
            AFHint(_limitsError!),
            const SizedBox(height: 6),
          ],
          Expanded(
            child: _messages.isEmpty && !_busy
                ? _emptyState()
                : ListView.builder(
                    controller: _scroll,
                    padding: const EdgeInsets.only(top: 4, bottom: 12),
                    itemCount: _messages.length + (_busy ? 1 : 0),
                    itemBuilder: (context, index) => index == _messages.length
                        ? const _Appear(child: _Thinking())
                        : _Appear(child: _bubble(_messages[index], categories)),
                  ),
          ),
          const SizedBox(height: 14),
          _composer(configured),
        ],
      ),
    );
  }

  Widget _unconfigured() {
    final t = context.af;
    return AFPanel(
      label: 'Not configured',
      child: Text(
        'This server has no Gemini API key, so the assistant cannot answer. '
        'Set AF_GEMINI_API_KEY on the API and restart it.',
        style: AFText.mono(size: 12.5, color: t.warn, height: 1.6),
      ),
    );
  }

  Widget _emptyState() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const AFEmptyState(
            glyph: '✦',
            message: 'Say what you need scheduled.\n'
                'Nothing changes until you confirm it.',
          ),
          const SizedBox(height: 18),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: AFHint(
              'It can see the next two months of your calendar, so you can '
              'say "move my Monday exam to 10am" or "cancel the lunch '
              'tomorrow" as easily as you can add something new.',
            ),
          ),
        ],
      ),
    );
  }

  Widget _bubble(_Message message, List<EventCategory> categories) {
    if (message.isUser) return _userBubble(message);
    if (message.failed) return _errorBubble(message);
    return _assistantBubble(message, categories);
  }

  Widget _userBubble(_Message message) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: Align(
        alignment: Alignment.centerRight,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520),
          child: AFPanel(
            accented: true,
            padding: const EdgeInsets.fromLTRB(17, 13, 15, 13),
            child: Text(message.text, style: AFText.body(context)),
          ),
        ),
      ),
    );
  }

  Widget _errorBubble(_Message message) {
    final t = context.af;
    return AFPanel(
      label: 'Problem',
      margin: const EdgeInsets.only(bottom: 18),
      child: Text(
        message.text,
        style: AFText.mono(size: 12.5, color: t.warn, height: 1.6),
      ),
    );
  }

  Widget _assistantBubble(_Message message, List<EventCategory> categories) {
    final t = context.af;

    EventCategory categoryFor(String slug) => categories.firstWhere(
          (c) => c.slug == slug,
          orElse: () => fallbackCategory,
        );

    return Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 7,
                height: 7,
                margin: const EdgeInsets.only(right: 8),
                decoration: BoxDecoration(
                  color: t.accent,
                  borderRadius: BorderRadius.circular(1),
                ),
              ),
              Text('ASSISTANT', style: AFText.panelLabel(context)),
            ],
          ),
          const SizedBox(height: 9),
          // Sans, not mono: this is the one voice in AF speaking in sentences
          // rather than reading out values.
          Text(message.text, style: AFText.body(context)),
          if (message.hasProposals) ...[
            const SizedBox(height: 16),
            for (var i = 0; i < message.sessions.length; i++)
              if (!message.droppedSessions.contains(i))
                SessionProposalCard(
                  proposal: message.sessions[i],
                  onRemove: _busy || message.committed
                      ? null
                      : () => setState(() => message.droppedSessions.add(i)),
                ),
            for (var i = 0; i < message.events.length; i++)
              if (!message.droppedEvents.contains(i))
                EventProposalCard(
                  proposal: message.events[i],
                  category: categoryFor(message.events[i].category),
                  onRemove: _busy || message.committed
                      ? null
                      : () => setState(() => message.droppedEvents.add(i)),
                ),
            for (var i = 0; i < message.removals.length; i++)
              if (!message.droppedRemovals.contains(i))
                RemovalProposalCard(
                  entry: message.removals[i],
                  onKeep: _busy || message.committed
                      ? null
                      : () => setState(() => message.droppedRemovals.add(i)),
                ),
            const SizedBox(height: 2),
            _commitControl(message),
          ],
        ],
      ),
    );
  }

  Widget _commitControl(_Message message) {
    if (message.committed) {
      return AFHint(_summarise(message), tip: true);
    }

    final kept = message.keptCount;
    final deleting = message.keptRemovals.isNotEmpty;

    return AFButton(
      label: _actionLabel(message),
      expand: true,
      icon: deleting ? Icons.warning_amber_rounded : Icons.check,
      variant: deleting ? AFButtonVariant.danger : AFButtonVariant.solid,
      onPressed: _busy || kept == 0 ? null : () => _commit(message),
    );
  }

  /// The composer: one bordered field with its controls inside it, rather than
  /// a field with a button parked alongside.
  ///
  /// Borrowed shape, AF materials — the focus treatment, the 4px radius and
  /// the mono controls are the same ones the rest of the app uses, so it reads
  /// as this app rather than as a chat window dropped into it.
  Widget _composer(bool configured) {
    final t = context.af;
    final enabled = !_busy && configured;
    final focused = _promptFocus.hasFocus;

    return AnimatedContainer(
      duration: const Duration(milliseconds: 160),
      curve: Curves.easeOut,
      decoration: BoxDecoration(
        color: focused ? t.panel : t.sunken,
        borderRadius: t.borderRadius,
        border: Border.all(color: focused ? t.accent : t.lineStrong),
        boxShadow: focused
            ? [BoxShadow(color: t.accentSoft, spreadRadius: 3, blurRadius: 0)]
            : null,
      ),
      padding: const EdgeInsets.fromLTRB(14, 12, 10, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: _prompt,
            focusNode: _promptFocus,
            enabled: enabled,
            minLines: 2,
            maxLines: 7,
            // Sans, not mono: this is the one field in AF that takes a
            // sentence rather than a value.
            style: AFText.body(context),
            cursorColor: t.accent,
            cursorWidth: 1.5,
            decoration: InputDecoration(
              isDense: true,
              filled: false,
              border: InputBorder.none,
              enabledBorder: InputBorder.none,
              focusedBorder: InputBorder.none,
              disabledBorder: InputBorder.none,
              contentPadding: EdgeInsets.zero,
              hintText: 'Write a message…',
              hintStyle: AFText.body(
                context,
                color: t.muted.withValues(alpha: 0.75),
              ),
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              AFIconButton(
                icon: Icons.add,
                tooltip: 'New chat',
                bordered: false,
                onPressed: _busy || _messages.isEmpty ? null : _reset,
              ),
              const Spacer(),
              if (_messages.isNotEmpty) ...[
                Text(
                  '${_messages.length} turns',
                  style: AFText.panelCount(context),
                ),
                const SizedBox(width: 12),
              ],
              AFButton(
                label: 'Send',
                icon: Icons.arrow_upward,
                onPressed: enabled ? _send : null,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Fades and lifts a turn into place the first time it is built.
///
/// Short and single-shot: a transcript that slides every message every rebuild
/// would be unreadable, so this runs once, on arrival, and is inert after.
class _Appear extends StatefulWidget {
  final Widget child;

  const _Appear({required this.child});

  @override
  State<_Appear> createState() => _AppearState();
}

class _AppearState extends State<_Appear> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    duration: const Duration(milliseconds: 260),
    vsync: this,
  )..forward();

  late final Animation<double> _curve = CurvedAnimation(
    parent: _controller,
    curve: Curves.easeOutCubic,
  );

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _curve,
      child: SlideTransition(
        position: Tween<Offset>(
          begin: const Offset(0, 0.04),
          end: Offset.zero,
        ).animate(_curve),
        child: widget.child,
      ),
    );
  }
}

/// The gap between sending and hearing back, held open so the transcript does
/// not simply sit there looking as though nothing was sent.
///
/// Three squares rather than a spinner: nothing else in AF spins, and the
/// mark's own vocabulary is square ticks on a rule.
class _Thinking extends StatefulWidget {
  const _Thinking();

  @override
  State<_Thinking> createState() => _ThinkingState();
}

class _ThinkingState extends State<_Thinking>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    duration: const Duration(milliseconds: 1100),
    vsync: this,
  )..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.af;

    return Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: Row(
        children: [
          for (var i = 0; i < 3; i++)
            AnimatedBuilder(
              animation: _controller,
              builder: (context, _) {
                // Each square trails the one before it by a third of a cycle,
                // so the row reads as a wave rather than three things blinking.
                final phase = (_controller.value - i * 0.18) % 1.0;
                final lit = (1 - (phase * 2 - 1).abs()).clamp(0.0, 1.0);
                return Container(
                  width: 6,
                  height: 6,
                  margin: const EdgeInsets.only(right: 5),
                  decoration: BoxDecoration(
                    color: Color.lerp(t.lineStrong, t.accent, lit),
                    borderRadius: BorderRadius.circular(1),
                  ),
                );
              },
            ),
          const SizedBox(width: 7),
          Text(
            'Thinking…',
            style: AFText.mono(size: 12, color: t.muted, letterSpacing: 0.22),
          ),
        ],
      ),
    );
  }
}
