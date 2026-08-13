import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../auth/auth_controller.dart';
import '../programs/af_program.dart';
import '../programs/calendar/calendar_provider.dart';
import '../theme/af_breakpoints.dart';
import '../theme/af_text.dart';
import '../theme/af_tokens.dart';
import '../widgets/af_account_button.dart';
import '../widgets/af_chip.dart';
import '../widgets/af_panel.dart';
import '../widgets/af_scaffold.dart';
import '../widgets/af_theme_toggle.dart';

/// The AF launcher.
///
/// Three sections: the programs themselves, what is happening today, and what
/// is coming next. Programs lead because launching one is the dashboard's
/// primary job; the two read-outs below answer "do I need to do anything?"
/// without opening anything.
class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  static const double _gap = 20;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final signedIn = ref.watch(isSignedInProvider);
    final user = ref.watch(currentUserProvider);

    return AFScaffold(
      title: 'AF',
      tagline: signedIn
          ? 'field tools — synced to your account'
          : 'field tools — sign in to sync',
      actions: const [
        AFAccountButton(),
        SizedBox(width: 10),
        AFThemeToggle(),
      ],
      footer: AFFooter(
        signedIn
            ? '${afPrograms.length} programs · synced as ${user?.email ?? 'your account'}'
            : '${afPrograms.length} programs · sign in to unlock and sync',
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final width = constraints.maxWidth;
          final desktop = width >= AFBreakpoints.desktop;

          return SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _ProgramsSection(width: width, signedIn: signedIn),
                const SizedBox(height: 28),
                if (desktop)
                  IntrinsicHeight(
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: const [
                        Expanded(flex: 2, child: _TodaySection()),
                        SizedBox(width: _gap),
                        Expanded(flex: 3, child: _UpNextSection()),
                      ],
                    ),
                  )
                else ...const [
                  _TodaySection(),
                  SizedBox(height: _gap),
                  _UpNextSection(),
                ],
                const SizedBox(height: 12),
              ],
            ),
          );
        },
      ),
    );
  }
}

// ---- section 1: programs ----

class _ProgramsSection extends StatelessWidget {
  final double width;
  final bool signedIn;

  const _ProgramsSection({required this.width, required this.signedIn});

  @override
  Widget build(BuildContext context) {
    final columns = width >= AFBreakpoints.desktop
        ? 3
        : width >= AFBreakpoints.twoColumn
            ? 2
            : 1;
    final tileWidth =
        (width - DashboardScreen._gap * (columns - 1)) / columns;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AFPanelLabel(label: 'Programs', count: '${afPrograms.length}'),
        const SizedBox(height: 12),
        Wrap(
          spacing: DashboardScreen._gap,
          runSpacing: DashboardScreen._gap,
          children: [
            for (final program in afPrograms)
              SizedBox(
                width: tileWidth,
                child: _ProgramTile(program: program, signedIn: signedIn),
              ),
          ],
        ),
      ],
    );
  }
}

class _ProgramTile extends StatelessWidget {
  final AFProgram program;
  final bool signedIn;

  const _ProgramTile({required this.program, required this.signedIn});

  @override
  Widget build(BuildContext context) {
    final t = context.af;
    final locked = program.requiresAuth && !signedIn;

    return AFPanel(
      label: program.name,
      countWidget: AFChip(
        label: locked
            ? 'locked'
            : (program.available ? 'ready' : 'soon'),
        color: locked ? t.warn : (program.available ? t.ok : t.muted),
      ),
      // Locked tiles stay tappable on purpose: the tap is how someone
      // discovers they need an account, so it routes to sign-in.
      onTap: locked
          ? () => context.go('/signin')
          : (program.available ? () => context.go(program.route) : null),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(program.tagline, style: AFText.meta(context, color: t.accent)),
          const SizedBox(height: 10),
          Text(program.description, style: AFText.body(context)),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: locked
                    ? Row(
                        children: [
                          Icon(Icons.lock_outline, size: 13, color: t.muted),
                          const SizedBox(width: 5),
                          Flexible(
                            child: Text(
                              'account required',
                              style: AFText.meta(context),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      )
                    : _ProgramStatus(programId: program.id),
              ),
              const SizedBox(width: 12),
              Text(
                locked
                    ? 'SIGN IN →'
                    : (program.available ? 'OPEN →' : 'SOON'),
                style: AFText.mono(
                  size: 12,
                  color: locked
                      ? t.warn
                      : (program.available ? t.accent : t.muted),
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

/// A live read-out per program, in the spirit of the QR Generator's always-on
/// counters. Programs without a meaningful one render nothing.
class _ProgramStatus extends ConsumerWidget {
  final String programId;

  const _ProgramStatus({required this.programId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final entries = ref.watch(agendaProvider).valueOrNull;
    if (entries == null) return const SizedBox.shrink();

    final today = dayKey(DateTime.now());
    final todays = entries.where((e) => isSameDay(e.start, today));

    final String label;
    switch (programId) {
      case 'checklists':
        final count =
            todays.where((e) => e.kind == AgendaKind.session).length;
        label = count == 0 ? 'nothing scheduled' : '$count today';
      case 'calendar':
        final count = todays.where((e) => e.kind == AgendaKind.event).length;
        label = count == 0 ? 'no events today' : '$count event'
            '${count == 1 ? '' : 's'} today';
      default:
        return const SizedBox.shrink();
    }

    return Text(
      label,
      style: AFText.meta(context),
      overflow: TextOverflow.ellipsis,
    );
  }
}

// ---- section 2: today ----

class _TodaySection extends ConsumerWidget {
  const _TodaySection();

  static final DateFormat _date = DateFormat('EEE d MMM');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.af;
    final entries = ref.watch(agendaProvider).valueOrNull ?? const [];

    final now = DateTime.now();
    final today = dayKey(now);
    final weekEnd = today.add(const Duration(days: 7));

    final todays = entries.where((e) => isSameDay(e.start, today)).toList();
    final sessions =
        todays.where((e) => e.kind == AgendaKind.session).length;
    final events = todays.where((e) => e.kind == AgendaKind.event).length;
    final week = entries
        .where((e) => !e.start.isBefore(today) && e.start.isBefore(weekEnd))
        .length;

    return AFPanel(
      label: 'Today',
      count: _date.format(now).toUpperCase(),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(child: _Stat(value: '$sessions', label: 'sessions')),
          _Rule(color: t.line),
          Expanded(child: _Stat(value: '$events', label: 'events')),
          _Rule(color: t.line),
          Expanded(child: _Stat(value: '$week', label: 'next 7 days')),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  final String value;
  final String label;

  const _Stat({required this.value, required this.label});

  @override
  Widget build(BuildContext context) {
    final t = context.af;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          value,
          style: AFText.mono(size: 28, color: t.ink, weight: FontWeight.w700),
        ),
        const SizedBox(height: 2),
        Text(
          label.toUpperCase(),
          style: AFText.mono(size: 10, color: t.muted, letterSpacing: 1.0),
        ),
      ],
    );
  }
}

class _Rule extends StatelessWidget {
  final Color color;

  const _Rule({required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 1,
      height: 44,
      margin: const EdgeInsets.symmetric(horizontal: 12),
      color: color,
    );
  }
}

// ---- section 3: up next ----

class _UpNextSection extends ConsumerWidget {
  const _UpNextSection();

  static final DateFormat _stamp = DateFormat('EEE d MMM · HH:mm');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.af;
    final upcoming = ref.watch(upcomingAgendaProvider).valueOrNull;

    return AFPanel(
      label: 'Up next',
      count: upcoming == null || upcoming.isEmpty ? '—' : '${upcoming.length}',
      child: upcoming == null || upcoming.isEmpty
          ? Padding(
              padding: const EdgeInsets.symmetric(vertical: 20),
              child: AFEmptyState(
                glyph: '',
                message: 'Nothing scheduled. Enjoy it.',
              ),
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (var i = 0; i < upcoming.length; i++) ...[
                  if (i > 0) Divider(height: 17, color: t.line),
                  _UpNextRow(entry: upcoming[i], stamp: _stamp),
                ],
              ],
            ),
    );
  }
}

class _UpNextRow extends StatelessWidget {
  final AgendaEntry entry;
  final DateFormat stamp;

  const _UpNextRow({required this.entry, required this.stamp});

  @override
  Widget build(BuildContext context) {
    final t = context.af;

    return InkWell(
      onTap: () => context.go(entry.route ?? '/calendar'),
      borderRadius: t.borderRadius,
      highlightColor: t.accentSoft,
      splashColor: t.accentSoft,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Container(
            width: 3,
            height: 30,
            margin: const EdgeInsets.only(right: 10),
            color: entry.color,
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  entry.title,
                  style: AFText.body(context),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  entry.allDay
                      ? '${stamp.format(entry.start).split(' · ').first} · all day'
                      : stamp.format(entry.start),
                  style: AFText.meta(context),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          AFChip(
            label: entry.kind == AgendaKind.session ? 'session' : 'event',
            color: entry.kind == AgendaKind.session ? t.accent : t.muted,
          ),
        ],
      ),
    );
  }
}
