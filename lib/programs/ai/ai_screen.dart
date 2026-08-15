import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../theme/af_text.dart';
import '../../theme/af_tokens.dart';
import '../../widgets/af_button.dart';
import '../../widgets/af_field.dart';
import '../../widgets/af_panel.dart';
import '../../widgets/af_scaffold.dart';
import '../../widgets/af_text_field.dart';
import '../calendar/calendar_provider.dart';
import '../calendar/category_provider.dart';
import '../calendar/event_category.dart';
import '../../providers/session_provider.dart';
import 'ai_api.dart';
import 'ai_proposal_card.dart';

/// reAFresh · AI — talk about what you need scheduled, and confirm what it
/// proposes.
///
/// The shape that matters is the pause in the middle. The assistant never
/// writes anything: it proposes, everything is shown for checking, and one
/// button commits. A model that wrote straight to a calendar would produce a
/// calendar nobody could trust, and trust is the whole point of a calendar.
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

/// One turn as it sits on screen.
///
/// Mutable, unlike most state in AF, because the two things that change after
/// a turn arrives — which proposals were dropped, and whether the rest were
/// saved — belong to that turn rather than to the page.
class _Message {
  final String role;
  final String text;
  final List<SessionProposal> sessions;
  final List<EventProposal> events;

  /// Indices the person removed. Held as index sets rather than by rebuilding
  /// the lists, so removing one cannot renumber the rest mid-review.
  final Set<int> droppedSessions = {};
  final Set<int> droppedEvents = {};

  /// Set once these were written. The cards stay on screen afterwards — the
  /// transcript is a record of what happened — but nothing about them can be
  /// changed or saved twice.
  bool committed = false;

  /// A failure, rendered in place rather than as a banner over the page. An
  /// error that scrolls away with the turn it belongs to stays attached to the
  /// thing that caused it.
  final bool failed;

  _Message.user(this.text)
      : role = AiTurn.roleUser,
        sessions = const [],
        events = const [],
        failed = false;

  _Message.assistant(AiAnswer answer)
      : role = AiTurn.roleAssistant,
        text = answer.reply,
        sessions = answer.sessions,
        events = answer.events,
        failed = false;

  _Message.error(this.text)
      : role = AiTurn.roleAssistant,
        sessions = const [],
        events = const [],
        failed = true;

  bool get isUser => role == AiTurn.roleUser;
  bool get hasProposals => sessions.isNotEmpty || events.isNotEmpty;

  int get keptCount =>
      (sessions.length - droppedSessions.length) +
      (events.length - droppedEvents.length);

  List<SessionProposal> get keptSessions => [
        for (var i = 0; i < sessions.length; i++)
          if (!droppedSessions.contains(i)) sessions[i],
      ];

  List<EventProposal> get keptEvents => [
        for (var i = 0; i < events.length; i++)
          if (!droppedEvents.contains(i)) events[i],
      ];

  /// What the server is told about this turn next time.
  ///
  /// Only the entries that survived review are sent: the assistant should be
  /// working from what is still on the table, not from what was thrown out.
  AiTurn toTurn() => AiTurn(
        role: role,
        text: text,
        sessions: keptSessions,
        events: keptEvents,
        committed: committed,
      );
}

class _AiScreenState extends ConsumerState<AiScreen> {
  late final AiApi _api = widget.api ?? AiApi();
  final _prompt = TextEditingController();
  final _scroll = ScrollController();

  final _messages = <_Message>[];

  AiLimits? _limits;
  String? _limitsError;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _loadLimits();
  }

  @override
  void dispose() {
    _prompt.dispose();
    _scroll.dispose();
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
        // This device's clock, because "next Monday" is relative to whoever is
        // asking rather than to wherever the server runs.
        now: DateTime.now(),
        categories: [for (final c in categories) c.slug],
      );
      if (mounted) setState(() => _messages.add(_Message.assistant(answer)));
    } on AiError catch (error) {
      if (mounted) setState(() => _messages.add(_Message.error(error.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
      _scrollToEnd();
    }
  }

  /// Writes the kept proposals of one turn. This is the only thing in the
  /// program that changes anything.
  Future<void> _commit(_Message message) async {
    if (_busy || message.committed) return;

    final sessions = message.keptSessions;
    final events = message.keptEvents;
    if (sessions.isEmpty && events.isEmpty) return;

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

      if (!mounted) return;
      setState(() => message.committed = true);
    } catch (error) {
      if (mounted) {
        setState(() => _messages
            .add(_Message.error('Some entries could not be saved: $error')));
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
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOut,
      );
    });
  }

  String _summarise(int sessions, int events) {
    final parts = <String>[
      if (sessions > 0) '$sessions session${sessions == 1 ? '' : 's'}',
      if (events > 0) '$events event${events == 1 ? '' : 's'}',
    ];
    return 'Added ${parts.join(' and ')}.';
  }

  // ---- build ----

  @override
  Widget build(BuildContext context) {
    final limits = _limits;
    final configured = limits?.configured ?? true;

    // Watched here rather than where it is used, which is inside a proposal
    // card that does not exist yet on the first turn. Reading a provider
    // nothing has watched only starts it — the first send would find it still
    // loading and refuse a message that was perfectly fine.
    final categories = ref.watch(categoriesProvider).valueOrNull ?? const [];

    return AFScaffold(
      title: 'reAFresh · AI',
      tagline: 'talk it through, then keep it',
      onBack: () => Navigator.of(context).maybePop(),
      footer: const AFFooter('Nothing is saved until you press the button.'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _header(),
          const SizedBox(height: 12),
          Expanded(
            child: _messages.isEmpty && !_busy
                ? _emptyState()
                : ListView.builder(
                    controller: _scroll,
                    padding: const EdgeInsets.only(bottom: 8),
                    itemCount: _messages.length + (_busy ? 1 : 0),
                    itemBuilder: (context, index) => index == _messages.length
                        ? const _Thinking()
                        : _bubble(_messages[index], categories),
                  ),
          ),
          const SizedBox(height: 12),
          _composer(configured),
        ],
      ),
    );
  }

  Widget _header() {
    final limits = _limits;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: AFPanelLabel(
                label: 'Conversation',
                count: _messages.isEmpty ? null : '${_messages.length} turns',
              ),
            ),
            if (_messages.isNotEmpty) ...[
              const SizedBox(width: 12),
              AFButton.quiet(
                label: 'New chat',
                onPressed: _busy ? null : _reset,
              ),
            ],
          ],
        ),
        // Better to say so on arrival than to let somebody type a paragraph
        // and find out the server cannot answer it.
        if (limits != null && !limits.configured) ...[
          const SizedBox(height: 12),
          AFPanel(
            label: 'Not configured',
            child: Text(
              'This server has no Gemini API key, so the assistant cannot '
              'answer. Set AF_GEMINI_API_KEY on the API and restart it.',
              style: AFText.mono(size: 12.5, color: context.af.warn, height: 1.6),
            ),
          ),
        ],
        if (_limitsError != null) AFHint(_limitsError!),
      ],
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
                'Nothing is written until you confirm it.',
          ),
          const SizedBox(height: 18),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: AFHint(
              'Try: "UAP Algoritma BAA1 next Monday 9am in room 401, and '
              'lunch with Dina on Wednesday". Then correct it — "make that '
              '10am", "drop the lunch" — and it will re-propose the rest.',
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
      padding: const EdgeInsets.only(bottom: 16),
      child: Align(
        alignment: Alignment.centerRight,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520),
          child: AFPanel(
            accented: true,
            padding: const EdgeInsets.fromLTRB(16, 13, 14, 13),
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
      margin: const EdgeInsets.only(bottom: 16),
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
      padding: const EdgeInsets.only(bottom: 20),
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
          const SizedBox(height: 8),
          // Sans, not mono: this is the one voice in AF speaking in sentences
          // rather than reading out values.
          Text(message.text, style: AFText.body(context)),
          if (message.hasProposals) ...[
            const SizedBox(height: 14),
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
            const SizedBox(height: 2),
            _commitControl(message),
          ],
        ],
      ),
    );
  }

  Widget _commitControl(_Message message) {
    if (message.committed) {
      return AFHint(
        _summarise(message.keptSessions.length, message.keptEvents.length),
        tip: true,
      );
    }

    final kept = message.keptCount;
    return AFButton(
      label: kept == 0 ? 'Nothing left to add' : 'Add $kept to my calendar',
      expand: true,
      icon: Icons.check,
      onPressed: _busy || kept == 0 ? null : () => _commit(message),
    );
  }

  Widget _composer(bool configured) {
    final enabled = !_busy && configured;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Expanded(
          child: AFTextField(
            controller: _prompt,
            hint: _messages.isEmpty
                ? 'UAP Algoritma BAA1 next Monday 9am in room 401'
                : 'Say what to change, or add something else',
            // Sans, not mono: this is the one field in AF that takes a
            // sentence rather than a value.
            mono: false,
            minLines: 1,
            maxLines: 5,
            enabled: enabled,
          ),
        ),
        const SizedBox(width: 10),
        AFButton(
          label: 'Send',
          icon: Icons.arrow_upward,
          onPressed: enabled ? _send : null,
        ),
      ],
    );
  }
}

/// The gap between sending and hearing back, held open so the transcript does
/// not simply sit there looking as though nothing was sent.
class _Thinking extends StatelessWidget {
  const _Thinking();

  @override
  Widget build(BuildContext context) {
    final t = context.af;
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Row(
        children: [
          SizedBox(
            width: 11,
            height: 11,
            child: CircularProgressIndicator(strokeWidth: 1.5, color: t.accent),
          ),
          const SizedBox(width: 10),
          Text(
            'Thinking…',
            style: AFText.mono(size: 12, color: t.muted, letterSpacing: 0.22),
          ),
        ],
      ),
    );
  }
}
