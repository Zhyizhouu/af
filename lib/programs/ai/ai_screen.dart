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

/// reAFresh · AI — say what you need scheduled and confirm what it proposes.
///
/// The shape that matters is the pause in the middle. The assistant never
/// writes anything: it proposes, everything is shown for checking, and one
/// button commits. A model that wrote straight to a calendar would produce a
/// calendar nobody could trust, and trust is the whole point of a calendar.
class AiScreen extends ConsumerStatefulWidget {
  final AiApi? api;

  const AiScreen({super.key, this.api});

  @override
  ConsumerState<AiScreen> createState() => _AiScreenState();
}

class _AiScreenState extends ConsumerState<AiScreen> {
  late final AiApi _api = widget.api ?? AiApi();
  final _prompt = TextEditingController();

  AiLimits? _limits;
  AiPlan? _plan;

  /// Proposals the person has removed. Kept as index sets rather than by
  /// rebuilding the plan, so removing one cannot renumber the rest mid-review.
  final _droppedSessions = <int>{};
  final _droppedEvents = <int>{};

  String? _error;
  String _toast = '';
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _loadLimits();
  }

  @override
  void dispose() {
    _prompt.dispose();
    if (widget.api == null) _api.close();
    super.dispose();
  }

  Future<void> _loadLimits() async {
    try {
      final limits = await _api.limits();
      if (mounted) setState(() => _limits = limits);
    } on AiError catch (error) {
      if (mounted) setState(() => _error = error.message);
    }
  }

  // ---- actions ----

  Future<void> _ask() async {
    final prompt = _prompt.text.trim();
    if (prompt.isEmpty || _busy) return;

    final categories = ref.read(categoriesProvider).valueOrNull ?? const [];
    if (categories.isEmpty) {
      setState(() => _error = 'Categories are still loading. Try again.');
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
      _toast = '';
      _plan = null;
      _droppedSessions.clear();
      _droppedEvents.clear();
    });

    try {
      final plan = await _api.plan(
        prompt: prompt,
        // This device's clock, because "next Monday" is relative to whoever
        // is asking rather than to wherever the server runs.
        now: DateTime.now(),
        categories: [for (final c in categories) c.slug],
      );
      if (mounted) setState(() => _plan = plan);
    } on AiError catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Writes the kept proposals. This is the only thing in the program that
  /// changes anything.
  Future<void> _commit() async {
    final plan = _plan;
    if (plan == null || _busy) return;

    final sessions = [
      for (var i = 0; i < plan.sessions.length; i++)
        if (!_droppedSessions.contains(i)) plan.sessions[i],
    ];
    final events = [
      for (var i = 0; i < plan.events.length; i++)
        if (!_droppedEvents.contains(i)) plan.events[i],
    ];
    if (sessions.isEmpty && events.isEmpty) return;

    setState(() {
      _busy = true;
      _error = null;
    });

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
      setState(() {
        _plan = null;
        _prompt.clear();
        _toast = _summarise(sessions.length, events.length);
      });
    } catch (error) {
      if (mounted) {
        setState(() => _error = 'Some entries could not be saved: $error');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
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
    final plan = _plan;
    final categories = ref.watch(categoriesProvider).valueOrNull ?? const [];

    return AFScaffold(
      title: 'reAFresh · AI',
      tagline: 'say it, check it, keep it',
      onBack: () => Navigator.of(context).maybePop(),
      footer: const AFFooter(
        'Nothing is saved until you press the button.',
      ),
      child: ListView(
        padding: const EdgeInsets.only(bottom: 8),
        children: [
          if (limits != null && !limits.configured) ...[
            _unconfigured(),
            const SizedBox(height: 18),
          ],
          _askPanel(limits),
          if (plan != null) ...[
            const SizedBox(height: 18),
            _planSection(plan, categories),
          ],
          if (_error != null) AFHint(_error!),
          if (_toast.isNotEmpty) AFHint(_toast, tip: true),
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

  Widget _askPanel(AiLimits? limits) {
    final configured = limits?.configured ?? true;

    return AFPanel(
      label: 'Ask',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AFTextField(
            controller: _prompt,
            hint: 'UAP Algoritma BAA1 next Monday 9am in room 401, '
                'and lunch with Dina on Wednesday',
            // Sans, not mono: this is the one field in AF that takes a
            // sentence rather than a value.
            mono: false,
            minLines: 3,
            maxLines: 6,
            enabled: !_busy && configured,
          ),
          const SizedBox(height: 8),
          AFHint(
            'Say what, when, and where. Name the course code and class for a '
            'proctoring session, and it will be created with its checklist.',
          ),
          const SizedBox(height: 18),
          AFButton(
            label: _busy && _plan == null ? 'Thinking…' : 'Ask',
            expand: true,
            icon: Icons.auto_awesome_outlined,
            onPressed: _busy || !configured ? null : _ask,
          ),
        ],
      ),
    );
  }

  Widget _planSection(AiPlan plan, List<EventCategory> categories) {
    final t = context.af;
    final keptSessions = plan.sessions.length - _droppedSessions.length;
    final keptEvents = plan.events.length - _droppedEvents.length;
    final kept = keptSessions + keptEvents;

    if (plan.isEmpty) {
      return AFPanel(
        label: 'Nothing to add',
        child: Text(
          plan.note.isEmpty
              ? 'That did not look like something to schedule. Try naming a '
                  'date and a time.'
              : plan.note,
          style: AFText.body(context, color: t.muted),
        ),
      );
    }

    EventCategory categoryFor(String slug) => categories.firstWhere(
          (c) => c.slug == slug,
          orElse: () => fallbackCategory,
        );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AFPanelLabel(
          label: 'Proposed',
          count: '$kept of ${plan.total} kept',
        ),
        const SizedBox(height: 12),
        // The model's own caveat, above the cards rather than below them —
        // "I assumed 2026" is worth reading before the list, not after.
        if (plan.note.isNotEmpty) ...[
          AFPanel(
            label: 'Note',
            margin: const EdgeInsets.only(bottom: 12),
            child: Text(plan.note, style: AFText.body(context, color: t.muted)),
          ),
        ],
        for (var i = 0; i < plan.sessions.length; i++)
          if (!_droppedSessions.contains(i))
            SessionProposalCard(
              proposal: plan.sessions[i],
              onRemove: _busy ? null : () => setState(() => _droppedSessions.add(i)),
            ),
        for (var i = 0; i < plan.events.length; i++)
          if (!_droppedEvents.contains(i))
            EventProposalCard(
              proposal: plan.events[i],
              category: categoryFor(plan.events[i].category),
              onRemove: _busy ? null : () => setState(() => _droppedEvents.add(i)),
            ),
        const SizedBox(height: 6),
        AFButton(
          label: _busy
              ? 'Saving…'
              : kept == 0
                  ? 'Nothing left to add'
                  : 'Add $kept to my calendar',
          expand: true,
          icon: Icons.check,
          onPressed: _busy || kept == 0 ? null : _commit,
        ),
        const SizedBox(height: 10),
        AFButton.quiet(
          label: 'Discard',
          expand: true,
          onPressed: _busy ? null : () => setState(() => _plan = null),
        ),
      ],
    );
  }
}
