import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../models/checklist_item.dart';
import '../../models/proctor_session.dart';
import '../../providers/session_provider.dart';
import '../../theme/af_text.dart';
import '../../theme/af_tokens.dart';
import '../../widgets/af_panel.dart';
import '../../widgets/af_progress.dart';
import '../../widgets/af_scaffold.dart';
import '../../widgets/af_theme_toggle.dart';

/// One session's checklist, grouped into the template's sections.
class ChecklistDetailScreen extends ConsumerWidget {
  final ProctorSession session;

  const ChecklistDetailScreen({super.key, required this.session});

  static final DateFormat _stamp = DateFormat('EEE d MMM yyyy · HH:mm');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sessionKey = session.key.toString();
    final checklistAsync = ref.watch(sessionChecklistProvider(sessionKey));

    final items = checklistAsync.valueOrNull ?? const <ChecklistItem>[];
    final total = items.length;
    final checked = items.where((item) => item.isChecked).length;

    return AFScaffold(
      title: '${session.type} · Room ${session.room}',
      tagline: _stamp.format(session.dateTime),
      onBack: () => Navigator.of(context).pop(),
      actions: const [AFThemeToggle()],
      footer: total == 0
          ? null
          : _ProgressFooter(checked: checked, total: total),
      child: checklistAsync.when(
        loading: () => const Center(
          child: SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
        error: (error, _) => AFEmptyState(
          glyph: '!',
          message: 'Could not load this checklist.\n$error',
          color: context.af.warn,
        ),
        data: (items) => _body(context, ref, items, sessionKey),
      ),
    );
  }

  Widget _body(
    BuildContext context,
    WidgetRef ref,
    List<ChecklistItem> items,
    String sessionKey,
  ) {
    if (items.isEmpty) {
      return const AFEmptyState(message: 'This session has no checklist items.');
    }

    // Preserve template order rather than sorting section names.
    final sections = <String, List<ChecklistItem>>{};
    for (final item in items) {
      sections.putIfAbsent(item.section, () => []).add(item);
    }

    final courseLine = [
      session.courseCode,
      session.courseName,
      session.courseClass,
    ].where((part) => part.isNotEmpty).join(' · ');

    return ListView(
      padding: const EdgeInsets.only(bottom: 8),
      children: [
        if (courseLine.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Text(courseLine, style: AFText.title(context)),
          ),
        for (final entry in sections.entries) ...[
          _SectionPanel(
            title: entry.key,
            items: entry.value,
            sessionKey: sessionKey,
          ),
          const SizedBox(height: 10),
        ],
      ],
    );
  }
}

class _SectionPanel extends ConsumerWidget {
  final String title;
  final List<ChecklistItem> items;
  final String sessionKey;

  const _SectionPanel({
    required this.title,
    required this.items,
    required this.sessionKey,
  });

  Future<void> _toggle(
    BuildContext context,
    WidgetRef ref,
    ChecklistItem item,
  ) async {
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);

    final archived = await ref
        .read(sessionControllerProvider)
        .toggleChecklistItem(item, sessionKey);

    if (!archived || !context.mounted) return;

    messenger.showSnackBar(
      const SnackBar(content: Text('Session complete — moved to Archived')),
    );
    navigator.pop();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.af;
    final checked = items.where((item) => item.isChecked).length;
    final complete = checked == items.length;

    return AFPanel(
      label: title,
      count: '$checked/${items.length}',
      accented: complete,
      padding: const EdgeInsets.fromLTRB(16, 16, 8, 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (var i = 0; i < items.length; i++) ...[
            if (i > 0) Divider(height: 1, color: t.line, endIndent: 8),
            _ChecklistRow(
              item: items[i],
              onToggle: () => _toggle(context, ref, items[i]),
            ),
          ],
        ],
      ),
    );
  }
}

class _ChecklistRow extends StatelessWidget {
  final ChecklistItem item;
  final VoidCallback onToggle;

  const _ChecklistRow({required this.item, required this.onToggle});

  @override
  Widget build(BuildContext context) {
    final t = context.af;

    return Material(
      type: MaterialType.transparency,
      child: InkWell(
        onTap: onToggle,
        highlightColor: t.accentSoft,
        splashColor: t.accentSoft,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 2),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // A plain square, drawn by hand so it keeps the 2px radius and
              // hairline weight the rest of the app uses.
              Container(
                margin: const EdgeInsets.only(top: 1, right: 12),
                width: 18,
                height: 18,
                decoration: BoxDecoration(
                  color: item.isChecked ? t.accent : t.sunken,
                  borderRadius: BorderRadius.circular(2),
                  border: Border.all(
                    color: item.isChecked ? t.accent : t.lineStrong,
                    width: 1.5,
                  ),
                ),
                child: item.isChecked
                    ? const Icon(Icons.check, size: 13, color: Colors.white)
                    : null,
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: Text(
                    item.label,
                    style: AFText.body(
                      context,
                      color: item.isChecked ? t.muted : t.ink,
                      decoration:
                          item.isChecked ? TextDecoration.lineThrough : null,
                    ).copyWith(decorationColor: t.muted),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ProgressFooter extends StatelessWidget {
  final int checked;
  final int total;

  const _ProgressFooter({required this.checked, required this.total});

  @override
  Widget build(BuildContext context) {
    final t = context.af;
    final progress = total == 0 ? 0.0 : checked / total;
    final percent = (progress * 100).round();

    return Padding(
      padding: const EdgeInsets.only(top: 12, bottom: 16),
      child: AFPanel(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Text(
                  '$checked / $total checked',
                  style: AFText.mono(
                    size: 12.5,
                    color: t.ink,
                    weight: FontWeight.w600,
                  ),
                ),
                const Spacer(),
                Text(
                  '$percent%',
                  style: AFText.mono(
                    size: 12.5,
                    color: progress >= 1 ? t.ok : t.muted,
                    weight: FontWeight.w600,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            AFProgressBar(value: progress, height: 6),
          ],
        ),
      ),
    );
  }
}
