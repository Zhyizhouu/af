import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../db/database_helper.dart';
import '../../theme/af_breakpoints.dart';
import '../../theme/af_text.dart';
import '../../theme/af_tokens.dart';
import '../../widgets/af_button.dart';
import '../../widgets/af_chip.dart';
import '../../widgets/af_panel.dart';
import '../../widgets/af_scaffold.dart';
import '../../widgets/af_theme_toggle.dart';
import 'calendar_provider.dart';
import 'event_editor_dialog.dart';

/// AF · Calendar — a month grid over the program's own events plus the
/// proctor sessions owned by Checklists.
class CalendarScreen extends ConsumerWidget {
  const CalendarScreen({super.key});

  static final DateFormat _monthFormat = DateFormat('MMMM yyyy');
  static final DateFormat _dayFormat = DateFormat('EEE d MMM');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final month = ref.watch(calendarMonthProvider);
    final selected = ref.watch(calendarSelectedDayProvider);

    return AFScaffold(
      title: 'AF · Calendar',
      tagline: 'everything on one grid',
      onBack: () => context.go('/dashboard'),
      actions: const [AFThemeToggle()],
      child: LayoutBuilder(
        builder: (context, constraints) {
          final split = constraints.maxWidth >= AFBreakpoints.split;

          final grid = _MonthPanel(month: month, selected: selected);
          final agenda = _AgendaPanel(day: selected, dayFormat: _dayFormat);

          if (split) {
            return SingleChildScrollView(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(flex: 3, child: grid),
                  const SizedBox(width: 20),
                  Expanded(flex: 2, child: agenda),
                ],
              ),
            );
          }

          return SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [grid, const SizedBox(height: 20), agenda],
            ),
          );
        },
      ),
    );
  }

  static String monthLabel(DateTime month) => _monthFormat.format(month);
}

class _MonthPanel extends ConsumerWidget {
  final DateTime month;
  final DateTime selected;

  const _MonthPanel({required this.month, required this.selected});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.af;
    final buckets = ref.watch(agendaByDayProvider).valueOrNull ?? const {};

    return AFPanel(
      label: 'Month',
      countWidget: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            CalendarScreen.monthLabel(month).toUpperCase(),
            style: AFText.panelCount(context),
          ),
          const SizedBox(width: 10),
          AFIconButton(
            icon: Icons.chevron_left,
            tooltip: 'Previous month',
            bordered: false,
            onPressed: () => ref.read(calendarMonthProvider.notifier).state =
                DateTime(month.year, month.month - 1),
          ),
          AFIconButton(
            icon: Icons.chevron_right,
            tooltip: 'Next month',
            bordered: false,
            onPressed: () => ref.read(calendarMonthProvider.notifier).state =
                DateTime(month.year, month.month + 1),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              for (final label in const [
                'MON',
                'TUE',
                'WED',
                'THU',
                'FRI',
                'SAT',
                'SUN',
              ])
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Text(
                      label,
                      textAlign: TextAlign.center,
                      style: AFText.mono(
                        size: 10,
                        color: t.muted,
                        weight: FontWeight.w700,
                        letterSpacing: 0.8,
                      ),
                    ),
                  ),
                ),
            ],
          ),
          _MonthGrid(month: month, selected: selected, buckets: buckets),
          const SizedBox(height: 14),
          Row(
            children: [
              AFButton.quiet(
                label: 'Today',
                onPressed: () {
                  final today = dayKey(DateTime.now());
                  ref.read(calendarMonthProvider.notifier).state = DateTime(
                    today.year,
                    today.month,
                  );
                  ref.read(calendarSelectedDayProvider.notifier).state = today;
                },
              ),
              const Spacer(),
              AFButton(
                label: 'New event',
                icon: Icons.add,
                onPressed: () => showDialog(
                  context: context,
                  builder: (_) => EventEditorDialog(initialDay: selected),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MonthGrid extends ConsumerWidget {
  final DateTime month;
  final DateTime selected;
  final Map<DateTime, List<AgendaEntry>> buckets;

  const _MonthGrid({
    required this.month,
    required this.selected,
    required this.buckets,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.af;

    // Grid always starts on the Monday on or before the 1st.
    final first = DateTime(month.year, month.month);
    final leading = first.weekday - DateTime.monday;
    final start = first.subtract(Duration(days: leading));
    final today = dayKey(DateTime.now());

    // Six rows covers every month layout, so the grid never changes height
    // as the user pages through — the panel would otherwise jump.
    const rows = 6;

    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: t.line),
        borderRadius: BorderRadius.circular(2),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          for (var row = 0; row < rows; row++)
            // No stretch: the grid lives in a scroll view, so height is
            // unbounded here. Each cell sets its own height instead.
            Row(
              children: [
                for (var col = 0; col < 7; col++)
                  Expanded(
                    child: _DayCell(
                      day: dayKey(start.add(Duration(days: row * 7 + col))),
                      month: month,
                      selected: selected,
                      today: today,
                      buckets: buckets,
                      showRightBorder: col < 6,
                      showBottomBorder: row < rows - 1,
                    ),
                  ),
              ],
            ),
        ],
      ),
    );
  }
}

class _DayCell extends ConsumerWidget {
  final DateTime day;
  final DateTime month;
  final DateTime selected;
  final DateTime today;
  final Map<DateTime, List<AgendaEntry>> buckets;
  final bool showRightBorder;
  final bool showBottomBorder;

  const _DayCell({
    required this.day,
    required this.month,
    required this.selected,
    required this.today,
    required this.buckets,
    required this.showRightBorder,
    required this.showBottomBorder,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.af;
    final entries = buckets[day] ?? const <AgendaEntry>[];
    final inMonth = day.month == month.month && day.year == month.year;
    final isSelected = isSameDay(day, selected);
    final isToday = isSameDay(day, today);

    return GestureDetector(
      onTap: () => ref.read(calendarSelectedDayProvider.notifier).state = day,
      child: Container(
        height: 62,
        decoration: BoxDecoration(
          color: isSelected
              ? t.accentSoft
              : (inMonth ? Colors.transparent : t.sunken),
          border: Border(
            right: showRightBorder
                ? BorderSide(color: t.line)
                : BorderSide.none,
            bottom: showBottomBorder
                ? BorderSide(color: t.line)
                : BorderSide.none,
          ),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 5),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Container(
              width: 20,
              height: 18,
              alignment: Alignment.center,
              decoration: isToday
                  ? BoxDecoration(
                      color: t.ink,
                      borderRadius: BorderRadius.circular(2),
                    )
                  : null,
              child: Text(
                '${day.day}',
                style: AFText.mono(
                  size: 12,
                  color: isToday ? t.onInk : (inMonth ? t.ink : t.muted),
                  weight: isSelected || isToday
                      ? FontWeight.w700
                      : FontWeight.w400,
                ),
              ),
            ),
            const SizedBox(height: 4),
            Wrap(
              spacing: 3,
              runSpacing: 3,
              alignment: WrapAlignment.center,
              children: [
                for (final entry in entries.take(4))
                  Container(
                    width: 5,
                    height: 5,
                    decoration: BoxDecoration(
                      color: entry.color,
                      shape: BoxShape.circle,
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _AgendaPanel extends ConsumerWidget {
  final DateTime day;
  final DateFormat dayFormat;

  const _AgendaPanel({required this.day, required this.dayFormat});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final entriesAsync = ref.watch(agendaForDayProvider(day));
    final entries = entriesAsync.valueOrNull ?? const <AgendaEntry>[];

    return AFPanel(
      label: dayFormat.format(day),
      count: entries.isEmpty ? '—' : '${entries.length}',
      child: entries.isEmpty
          ? Padding(
              padding: const EdgeInsets.symmetric(vertical: 28),
              child: AFEmptyState(
                message: 'Nothing on this day.\nTap “New event” to add one.',
              ),
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final entry in entries) _AgendaRow(entry: entry, day: day),
              ],
            ),
    );
  }
}

class _AgendaRow extends ConsumerWidget {
  final AgendaEntry entry;
  final DateTime day;

  const _AgendaRow({required this.entry, required this.day});

  static final DateFormat _time = DateFormat('HH:mm');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.af;

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          borderRadius: t.borderRadius,
          highlightColor: t.accentSoft,
          splashColor: t.accentSoft,
          onTap: () {
            if (entry.route != null) {
              context.go(entry.route!);
              return;
            }
            // Calendar's own events open the editor; sessions belong to
            // Checklists and are navigated to instead.
            final event = DatabaseHelper.instance.calendarEventsBox.get(
              entry.id,
            );
            if (event == null) return;
            showDialog(
              context: context,
              builder: (_) => EventEditorDialog(event: event, initialDay: day),
            );
          },
          // Colour strip drawn over a uniform border rather than as a thicker
          // left side: Flutter asserts that a rounded box's sides match.
          child: ClipRRect(
            borderRadius: t.borderRadius,
            child: Stack(
              children: [
                Container(
                  padding: const EdgeInsets.fromLTRB(13, 10, 10, 10),
                  decoration: BoxDecoration(
                    color: t.sunken,
                    border: Border.all(color: t.line),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(
                        width: 44,
                        child: Text(
                          entry.allDay ? 'all\nday' : _time.format(entry.start),
                          style: AFText.mono(size: 11.5, color: t.muted),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              entry.title,
                              style: AFText.body(context),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                            if (entry.subtitle.isNotEmpty) ...[
                              const SizedBox(height: 2),
                              Text(
                                entry.subtitle,
                                style: AFText.meta(context),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ],
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      AFChip(
                        label: entry.kind == AgendaKind.session
                            ? 'session'
                            : 'event',
                        color: entry.kind == AgendaKind.session
                            ? t.accent
                            : t.muted,
                      ),
                    ],
                  ),
                ),
                PositionedDirectional(
                  start: 0,
                  top: 0,
                  bottom: 0,
                  width: 3,
                  child: ColoredBox(color: entry.color),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
