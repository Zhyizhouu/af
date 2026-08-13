import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../models/proctor_session.dart';
import '../../providers/session_provider.dart';
import '../../theme/af_text.dart';
import '../../theme/af_tokens.dart';
import '../../widgets/af_button.dart';
import '../../widgets/af_chip.dart';
import '../../widgets/af_panel.dart';
import '../../widgets/af_progress.dart';
import '../../widgets/af_scaffold.dart';
import '../../widgets/af_segmented.dart';
import '../../widgets/af_theme_toggle.dart';
import 'add_session_dialog.dart';
import 'checklist_detail_screen.dart';

/// AF · Checklists — the proctor session list.
class ChecklistHomeScreen extends ConsumerWidget {
  const ChecklistHomeScreen({super.key});

  static final DateFormat _stamp = DateFormat('EEE d MMM · HH:mm');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sessionsAsync = ref.watch(filteredSessionsProvider);
    final filter = ref.watch(sessionFilterProvider);

    return AFScaffold(
      title: 'AF · Checklists',
      tagline: 'proctor sessions, start to finish',
      onBack: () => Navigator.of(context).pop(),
      actions: const [AFThemeToggle()],
      footer: Padding(
        padding: const EdgeInsets.only(top: 16, bottom: 16),
        child: AFButton(
          label: 'New session',
          icon: Icons.add,
          expand: true,
          onPressed: () => showDialog(
            context: context,
            builder: (_) => const AddSessionDialog(),
          ),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AFSegmented<SessionFilter>(
            value: filter,
            onChanged: (value) =>
                ref.read(sessionFilterProvider.notifier).state = value,
            segments: const [
              AFSegment(value: SessionFilter.today, label: 'Today'),
              AFSegment(value: SessionFilter.upcoming, label: 'Upcoming'),
              AFSegment(value: SessionFilter.archived, label: 'Archived'),
            ],
          ),
          const SizedBox(height: 16),
          Expanded(
            child: sessionsAsync.when(
              data: (sessions) => _list(context, ref, sessions, filter),
              loading: () => const Center(
                child: SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
              error: (error, _) => AFEmptyState(
                glyph: '!',
                message: 'Could not load sessions.\n$error',
                color: context.af.warn,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _list(
    BuildContext context,
    WidgetRef ref,
    List<ProctorSession> sessions,
    SessionFilter filter,
  ) {
    if (sessions.isEmpty) {
      return AFEmptyState(
        message: switch (filter) {
          SessionFilter.today => 'No sessions today.',
          SessionFilter.upcoming => 'No upcoming sessions.',
          SessionFilter.archived => 'No archived sessions yet.',
        },
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.only(bottom: 8),
      itemCount: sessions.length,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (context, index) =>
          _SessionCard(session: sessions[index], stamp: _stamp),
    );
  }
}

class _SessionCard extends ConsumerWidget {
  final ProctorSession session;
  final DateFormat stamp;

  const _SessionCard({required this.session, required this.stamp});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.af;
    final sessionKey = session.key.toString();
    final checklistAsync = ref.watch(sessionChecklistProvider(sessionKey));

    final items = checklistAsync.valueOrNull ?? const [];
    final total = items.length;
    final checked = items.where((item) => item.isChecked).length;
    final progress = total == 0 ? 0.0 : checked / total;
    final archived = session.status == 'archived';

    final now = DateTime.now();
    final isToday = session.dateTime.year == now.year &&
        session.dateTime.month == now.month &&
        session.dateTime.day == now.day;

    return AFPanel(
      label: '${session.type} · Room ${session.room}',
      accented: isToday && !archived,
      padding: const EdgeInsets.all(16),
      countWidget: AFChip(
        label: archived ? 'done' : '$checked/$total',
        color: archived
            ? t.ok
            : (total > 0 && checked == total ? t.ok : t.muted),
      ),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => ChecklistDetailScreen(session: session),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (session.courseCode.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text(
                [
                  session.courseCode,
                  if (session.courseName.isNotEmpty) session.courseName,
                  if (session.courseClass.isNotEmpty) session.courseClass,
                ].join(' · '),
                style: AFText.body(context),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          Text(stamp.format(session.dateTime), style: AFText.meta(context)),
          const SizedBox(height: 12),
          AFProgressBar(value: progress),
        ],
      ),
    );
  }
}
