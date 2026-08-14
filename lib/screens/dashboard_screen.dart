import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../auth/auth_controller.dart';
import '../models/habit.dart';
import '../programs/af_program.dart';
import '../programs/calendar/calendar_provider.dart';
import '../programs/calendar/event_category.dart';
import '../programs/habits/habit_chart.dart';
import '../programs/habits/habit_provider.dart';
import '../programs/habits/habit_time.dart';
import '../theme/af_breakpoints.dart';
import '../theme/af_text.dart';
import '../theme/af_tokens.dart';
import '../widgets/af_account_button.dart';
import '../widgets/af_chip.dart';
import '../widgets/af_glass_icon.dart';
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
      maxWidth: AFScaffold.maxWideWidth,
      footer: AFFooter(
        signedIn
            ? '${afPrograms.length} programs · synced as ${user?.email ?? 'your account'}'
            : '${afPrograms.length} programs · sign in to unlock and sync',
        showClock: true,
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
                // Signing out does not wipe the Hive boxes — AF is local-first,
                // and a sign-out is not a request to destroy anything. So the
                // read-outs have to be gated the same way the tiles and the
                // router already gate the programs they summarise, or they go
                // on showing the last account's habits and agenda to whoever
                // opens the laptop next.
                if (!signedIn)
                  const _SignedOutPanel()
                else ...[
                  if (desktop)
                    IntrinsicHeight(
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: const [
                          Expanded(flex: 2, child: _HabitsSection()),
                          SizedBox(width: _gap),
                          Expanded(flex: 3, child: _HabitChartSection()),
                        ],
                      ),
                    )
                  else ...const [
                    _HabitsSection(),
                    SizedBox(height: _gap),
                    _HabitChartSection(),
                  ],
                  const SizedBox(height: _gap),
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

/// The launcher proper: a gallery of marks, the way a home screen presents
/// apps. No taglines, no descriptions, no per-program read-outs — the mark and
/// its name are the whole affordance, and the two panels underneath already
/// answer "is there anything to do?".
class _ProgramsSection extends StatelessWidget {
  final double width;
  final bool signedIn;

  const _ProgramsSection({required this.width, required this.signedIn});

  @override
  Widget build(BuildContext context) {
    final compact = width < AFBreakpoints.twoColumn;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AFPanelLabel(label: 'Programs', count: '${afPrograms.length}'),
        const SizedBox(height: 20),
        // Left-aligned and free-flowing rather than stretched to fill: a
        // gallery reads as a shelf of apps, not as a row of panels.
        // Sized so three marks still make one row on a 390px phone, which is
        // what keeps it reading as a home screen rather than a wrapped list.
        Wrap(
          spacing: compact ? 16 : 30,
          runSpacing: 24,
          children: [
            for (final program in afPrograms)
              _ProgramTile(
                program: program,
                signedIn: signedIn,
                size: compact ? 72 : 96,
              ),
          ],
        ),
      ],
    );
  }
}

/// One app in the gallery: the mark, its name, and a corner badge when it
/// cannot be opened.
class _ProgramTile extends StatelessWidget {
  final AFProgram program;
  final bool signedIn;
  final double size;

  const _ProgramTile({
    required this.program,
    required this.signedIn,
    required this.size,
  });

  @override
  Widget build(BuildContext context) {
    final t = context.af;
    final locked = program.requiresAuth && !signedIn;
    final dimmed = locked || !program.available;
    final glyph = AFGlassGlyph.forProgram(program.id) ?? AFGlassGlyph.af;

    return SizedBox(
      width: size + 30,
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          // Locked marks stay tappable on purpose: the tap is how someone
          // discovers they need an account, so it routes to sign-in.
          onTap: locked
              ? () => context.go('/signin')
              : (program.available ? () => context.go(program.route) : null),
          borderRadius: t.borderRadius,
          highlightColor: t.accentSoft,
          splashColor: t.accentSoft,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Stack(
                  clipBehavior: Clip.none,
                  children: [
                    // The mark is never faded. A dark plate dimmed against the
                    // light desk goes muddy grey and reads as broken rather
                    // than as unavailable; the badge and the muted name carry
                    // that instead, which is how a home screen does it too.
                    AFGlassIcon(glyph: glyph, size: size),
                    if (dimmed)
                      Positioned(
                        right: -3,
                        bottom: -3,
                        child: _StateBadge(
                          icon: locked ? Icons.lock_outline : Icons.schedule,
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 12),
                Text(
                  program.name.toUpperCase(),
                  textAlign: TextAlign.center,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AFText.mono(
                    size: 10.5,
                    color: dimmed ? t.muted : t.ink,
                    weight: FontWeight.w600,
                    letterSpacing: 1.1,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The marker riding the corner of a mark that cannot be opened — locked
/// behind an account, or not built yet.
class _StateBadge extends StatelessWidget {
  final IconData icon;

  const _StateBadge({required this.icon});

  @override
  Widget build(BuildContext context) {
    final t = context.af;
    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: t.panel,
        borderRadius: t.borderRadius,
        border: Border.all(color: t.lineStrong),
      ),
      child: Icon(icon, size: 11, color: t.muted),
    );
  }
}

/// What stands in for the read-outs when nobody is signed in.
///
/// One panel rather than four empty ones: the answer to every read-out is the
/// same, and repeating it four times reads like four separate failures.
class _SignedOutPanel extends StatelessWidget {
  const _SignedOutPanel();

  @override
  Widget build(BuildContext context) {
    return AFPanel(
      label: 'Your day',
      count: 'LOCKED',
      onTap: () => context.go('/signin'),
      child: const Padding(
        padding: EdgeInsets.symmetric(vertical: 18),
        child: AFEmptyState(
          glyph: '',
          message: 'Sign in to see your habits, today, and what is coming up.',
        ),
      ),
    );
  }
}

// ---- section 2: habits ----

/// Today's habits, tickable in place. The dashboard is where the ticking
/// actually happens; the Habits page is for history and for managing the list.
class _HabitsSection extends ConsumerWidget {
  const _HabitsSection();

  static final DateFormat _habitDate = DateFormat('d MMMM y');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.af;
    final habits = ref.watch(habitsProvider).valueOrNull ?? const <Habit>[];
    final marks = ref.watch(todayMarksProvider).valueOrNull ?? const <String>{};
    // Watched, so a tab left open past midnight ticks the new day rather than
    // writing into the day key this closure was built with.
    final today = ref.watch(currentDayProvider);

    return AFPanel(
      // The date comes off the watched day, not the clock, so it rolls over
      // with the rest of the panel rather than going stale at midnight.
      label: 'Habits today - ${_habitDate.format(dayFromKey(today))}',
      count: habits.isEmpty ? '—' : '${marks.length}/${habits.length}',
      onTap: () => context.go('/habits'),
      child: habits.isEmpty
          ? Padding(
              padding: const EdgeInsets.symmetric(vertical: 20),
              child: AFEmptyState(
                glyph: '',
                message: 'No habits yet. Open Habits to add one.',
              ),
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (var i = 0; i < habits.length; i++) ...[
                  if (i > 0) Divider(height: 1, color: t.line),
                  _HabitCheckRow(
                    habit: habits[i],
                    checked: marks.contains(habits[i].id),
                    onTap: () => ref
                        .read(habitControllerProvider)
                        .toggle(habits[i].id, today),
                  ),
                ],
              ],
            ),
    );
  }
}

class _HabitCheckRow extends StatelessWidget {
  final Habit habit;
  final bool checked;
  final VoidCallback onTap;

  const _HabitCheckRow({
    required this.habit,
    required this.checked,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = context.af;
    final tone = toneAt(habit.toneIndex).resolve(context);

    return Material(
      type: MaterialType.transparency,
      child: InkWell(
        onTap: onTap,
        highlightColor: t.accentSoft,
        splashColor: t.accentSoft,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 2),
          child: Row(
            children: [
              Container(
                margin: const EdgeInsets.only(right: 12),
                width: 18,
                height: 18,
                decoration: BoxDecoration(
                  color: checked ? tone : t.sunken,
                  borderRadius: BorderRadius.circular(2),
                  border: Border.all(
                    color: checked ? tone : t.lineStrong,
                    width: 1.5,
                  ),
                ),
                child: checked
                    ? const Icon(Icons.check, size: 13, color: Colors.white)
                    : null,
              ),
              Expanded(
                child: Text(
                  habit.name,
                  style: AFText.body(
                    context,
                    color: checked ? t.muted : t.ink,
                    decoration:
                        checked ? TextDecoration.lineThrough : null,
                  ).copyWith(decorationColor: t.muted),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HabitChartSection extends ConsumerWidget {
  const _HabitChartSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AFPanel(
      label: 'Completion',
      // The range scopes this panel and nothing else on the page, so the
      // control sits in its header rather than floating over the plot.
      countWidget: const HabitRangeBar(),
      child: const SizedBox(height: 148, child: HabitChart(height: 148)),
    );
  }
}

// ---- section 3: today ----

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
            color: agendaEntryColor(context, entry),
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
            label: entry.kind == AgendaKind.session
                ? 'session'
                : (entry.category?.label ?? 'event'),
            color: agendaEntryColor(context, entry),
          ),
        ],
      ),
    );
  }
}
