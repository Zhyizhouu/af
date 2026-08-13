import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../programs/af_program.dart';
import '../providers/session_provider.dart';
import '../theme/af_text.dart';
import '../theme/af_tokens.dart';
import '../widgets/af_chip.dart';
import '../widgets/af_panel.dart';
import '../widgets/af_scaffold.dart';
import '../widgets/af_theme_toggle.dart';

/// The AF launcher: every installed program, with a live status line each.
class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  /// Below this the tiles go single-column.
  static const double _twoColumnBreakpoint = 620;
  static const double _gap = 20;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AFScaffold(
      title: 'AF',
      tagline: 'field tools — everything stays on device',
      actions: const [AFThemeToggle()],
      footer: AFFooter(
        '${afPrograms.length} programs installed · no accounts, no sync',
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final columns =
              constraints.maxWidth >= _twoColumnBreakpoint ? 2 : 1;
          final tileWidth =
              (constraints.maxWidth - _gap * (columns - 1)) / columns;

          return SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                AFPanelLabel(
                  label: 'Programs',
                  count: '${afPrograms.length}',
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: _gap,
                  runSpacing: _gap,
                  children: [
                    for (final program in afPrograms)
                      SizedBox(
                        width: tileWidth,
                        child: _ProgramTile(program: program),
                      ),
                  ],
                ),
                const SizedBox(height: 8),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _ProgramTile extends StatelessWidget {
  final AFProgram program;

  const _ProgramTile({required this.program});

  @override
  Widget build(BuildContext context) {
    final t = context.af;

    return AFPanel(
      label: program.name,
      countWidget: AFChip(
        label: program.available ? 'ready' : 'soon',
        color: program.available ? t.ok : t.muted,
      ),
      onTap: program.available
          ? () => Navigator.of(context).push(
                MaterialPageRoute(builder: program.builder),
              )
          : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(program.tagline, style: AFText.meta(context, color: t.accent)),
          const SizedBox(height: 10),
          Text(program.description, style: AFText.body(context)),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(child: _ProgramStatus(programId: program.id)),
              const SizedBox(width: 12),
              Text(
                program.available ? 'OPEN →' : 'SOON',
                style: AFText.mono(
                  size: 12,
                  color: program.available ? t.accent : t.muted,
                  weight: FontWeight.w700,
                  letterSpacing: 0.6,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// A live read-out for a program, in the spirit of the QR Generator's
/// always-on counters. Programs without one render an empty line.
class _ProgramStatus extends ConsumerWidget {
  final String programId;

  const _ProgramStatus({required this.programId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (programId != 'checklists') return const SizedBox.shrink();

    final sessions = ref.watch(activeSessionsProvider).valueOrNull;
    if (sessions == null) return const SizedBox.shrink();

    final now = DateTime.now();
    final today = sessions
        .where(
          (session) =>
              session.dateTime.year == now.year &&
              session.dateTime.month == now.month &&
              session.dateTime.day == now.day,
        )
        .length;

    final label = switch (today) {
      0 => sessions.isEmpty
          ? 'nothing scheduled'
          : '${sessions.length} upcoming',
      1 => '1 session today',
      _ => '$today sessions today',
    };

    return Text(
      label,
      style: AFText.meta(context),
      overflow: TextOverflow.ellipsis,
    );
  }
}
