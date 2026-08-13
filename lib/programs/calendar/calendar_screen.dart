import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../theme/af_breakpoints.dart';
import '../../theme/af_text.dart';
import '../../theme/af_tokens.dart';
import '../../widgets/af_button.dart';
import '../../widgets/af_chip.dart';
import '../../widgets/af_panel.dart';
import '../../widgets/af_scaffold.dart';
import '../../widgets/af_segmented.dart';
import '../../widgets/af_theme_toggle.dart';
import 'calendar_provider.dart';
import 'category_provider.dart';
import 'event_category.dart';
import 'calendar_time_grid.dart';
import 'event_editor_dialog.dart';

/// AF · Calendar — the program's own events plus proctor sessions from
/// Checklists, at five zoom levels.
class CalendarScreen extends ConsumerWidget {
  const CalendarScreen({super.key});

  static final DateFormat _monthYear = DateFormat('MMMM yyyy');
  static final DateFormat _dayLong = DateFormat('EEEE d MMMM yyyy');
  static final DateFormat _dayShort = DateFormat('d MMM');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final view = ref.watch(calendarViewProvider);
    final anchor = ref.watch(calendarAnchorProvider);

    return AFScaffold(
      title: 'AF · Calendar',
      tagline: 'everything on one grid',
      onBack: () => context.go('/dashboard'),
      actions: const [AFThemeToggle()],
      // Time grids want every pixel; the date grids read better contained.
      maxWidth: view.isTimeGrid || view == CalendarView.year
          ? AFScaffold.maxFullWidth
          : AFScaffold.maxWideWidth,
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _Toolbar(view: view, anchor: anchor),
            const SizedBox(height: 16),
            _body(context, ref, view, anchor),
            const SizedBox(height: 16),
            const _CategoryLegend(),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
  }

  Widget _body(
    BuildContext context,
    WidgetRef ref,
    CalendarView view,
    DateTime anchor,
  ) {
    final buckets = ref.watch(agendaByDayProvider).valueOrNull ?? const {};

    if (view == CalendarView.year) {
      return _YearView(anchor: anchor, buckets: buckets);
    }

    if (view.isTimeGrid) {
      final range = visibleRange(view, anchor);
      final days = <DateTime>[];
      for (var day = range.start;
          !day.isAfter(range.end);
          day = day.add(const Duration(days: 1))) {
        days.add(day);
      }

      return AFPanel(
        label: view.label,
        count: _rangeLabel(view, anchor),
        padding: const EdgeInsets.fromLTRB(12, 16, 12, 12),
        child: CalendarTimeGrid(days: days, buckets: buckets),
      );
    }

    // Month: grid plus the selected day's agenda beside it when there is room.
    final grid = _MonthPanel(anchor: anchor, buckets: buckets);
    final agenda = _AgendaPanel(day: anchor);

    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth >= AFBreakpoints.split) {
          return Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(flex: 3, child: grid),
              const SizedBox(width: 20),
              Expanded(flex: 2, child: agenda),
            ],
          );
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [grid, const SizedBox(height: 20), agenda],
        );
      },
    );
  }

  static String _rangeLabel(CalendarView view, DateTime anchor) {
    switch (view) {
      case CalendarView.year:
        return '${anchor.year}';
      case CalendarView.month:
        return _monthYear.format(anchor).toUpperCase();
      case CalendarView.day:
        return _dayLong.format(anchor).toUpperCase();
      case CalendarView.week:
      case CalendarView.threeDay:
        final range = visibleRange(view, anchor);
        return '${_dayShort.format(range.start)} — '
                '${_dayShort.format(range.end)}'
            .toUpperCase();
    }
  }

  static String rangeLabel(CalendarView view, DateTime anchor) =>
      _rangeLabel(view, anchor);
}

// ---- toolbar ----

class _Toolbar extends ConsumerWidget {
  final CalendarView view;
  final DateTime anchor;

  const _Toolbar({required this.view, required this.anchor});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.af;

    void step(int direction) {
      ref.read(calendarAnchorProvider.notifier).state =
          stepAnchor(view, anchor, direction);
    }

    final switcher = AFSegmented<CalendarView>(
      value: view,
      onChanged: (value) =>
          ref.read(calendarViewProvider.notifier).state = value,
      segments: [
        for (final option in CalendarView.values)
          AFSegment(
            value: option,
            // The full labels do not fit five-up on a phone.
            label: MediaQuery.sizeOf(context).width >= AFBreakpoints.split
                ? option.label
                : option.short,
          ),
      ],
    );

    final controls = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        AFIconButton(
          icon: Icons.chevron_left,
          tooltip: 'Previous',
          onPressed: () => step(-1),
        ),
        const SizedBox(width: 6),
        AFIconButton(
          icon: Icons.chevron_right,
          tooltip: 'Next',
          onPressed: () => step(1),
        ),
        const SizedBox(width: 10),
        AFButton.ghost(
          label: 'Today',
          onPressed: () => ref.read(calendarAnchorProvider.notifier).state =
              dayKey(DateTime.now()),
        ),
        const SizedBox(width: 9),
        AFButton(
          label: 'New event',
          icon: Icons.add,
          onPressed: () => showDialog(
            context: context,
            builder: (_) => EventEditorDialog(initialDay: anchor),
          ),
        ),
      ],
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          CalendarScreen.rangeLabel(view, anchor),
          style: AFText.mono(
            size: 13,
            color: t.ink,
            weight: FontWeight.w700,
            letterSpacing: 1.2,
          ),
        ),
        const SizedBox(height: 12),
        LayoutBuilder(
          builder: (context, constraints) {
            if (constraints.maxWidth >= AFBreakpoints.split) {
              return Row(
                children: [
                  SizedBox(width: 420, child: switcher),
                  const Spacer(),
                  controls,
                ],
              );
            }
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                switcher,
                const SizedBox(height: 12),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: controls,
                ),
              ],
            );
          },
        ),
      ],
    );
  }
}

// ---- month ----

class _MonthPanel extends ConsumerWidget {
  final DateTime anchor;
  final Map<DateTime, List<AgendaEntry>> buckets;

  const _MonthPanel({required this.anchor, required this.buckets});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.af;

    return AFPanel(
      label: 'Month',
      count: CalendarScreen.rangeLabel(CalendarView.month, anchor),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              for (final label in const [
                'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN',
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
          MonthGrid(anchor: anchor, buckets: buckets),
        ],
      ),
    );
  }
}

/// Six-row day grid for one month. Fixed row count so the panel does not
/// change height as you page between months.
class MonthGrid extends ConsumerWidget {
  final DateTime anchor;
  final Map<DateTime, List<AgendaEntry>> buckets;

  const MonthGrid({super.key, required this.anchor, required this.buckets});

  static const int rows = 6;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.af;

    final first = DateTime(anchor.year, anchor.month);
    final start =
        first.subtract(Duration(days: first.weekday - DateTime.monday));
    final today = dayKey(DateTime.now());

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
                      anchor: anchor,
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
  final DateTime anchor;
  final DateTime today;
  final Map<DateTime, List<AgendaEntry>> buckets;
  final bool showRightBorder;
  final bool showBottomBorder;

  const _DayCell({
    required this.day,
    required this.anchor,
    required this.today,
    required this.buckets,
    required this.showRightBorder,
    required this.showBottomBorder,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.af;
    final entries = buckets[day] ?? const <AgendaEntry>[];
    final inMonth = day.month == anchor.month && day.year == anchor.year;
    final isSelected = isSameDay(day, anchor);
    final isToday = isSameDay(day, today);

    return GestureDetector(
      onTap: () => ref.read(calendarAnchorProvider.notifier).state = day,
      onDoubleTap: () {
        ref.read(calendarAnchorProvider.notifier).state = day;
        ref.read(calendarViewProvider.notifier).state = CalendarView.day;
      },
      child: Container(
        height: 62,
        decoration: BoxDecoration(
          color: isSelected
              ? t.accentSoft
              : (inMonth ? Colors.transparent : t.sunken),
          border: Border(
            right:
                showRightBorder ? BorderSide(color: t.line) : BorderSide.none,
            bottom:
                showBottomBorder ? BorderSide(color: t.line) : BorderSide.none,
          ),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 5),
        child: Column(
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
                      color: agendaEntryColor(context, entry),
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

// ---- year ----

class _YearView extends ConsumerWidget {
  final DateTime anchor;
  final Map<DateTime, List<AgendaEntry>> buckets;

  const _YearView({required this.anchor, required this.buckets});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth >= 1180
            ? 4
            : constraints.maxWidth >= 860
                ? 3
                : constraints.maxWidth >= 560
                    ? 2
                    : 1;
        const gap = 16.0;
        final width = (constraints.maxWidth - gap * (columns - 1)) / columns;

        return Wrap(
          spacing: gap,
          runSpacing: gap,
          children: [
            for (var month = 1; month <= 12; month++)
              SizedBox(
                width: width,
                child: _MiniMonth(
                  month: DateTime(anchor.year, month),
                  buckets: buckets,
                ),
              ),
          ],
        );
      },
    );
  }
}

class _MiniMonth extends ConsumerWidget {
  final DateTime month;
  final Map<DateTime, List<AgendaEntry>> buckets;

  const _MiniMonth({required this.month, required this.buckets});

  static final DateFormat _name = DateFormat('MMMM');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.af;
    final today = dayKey(DateTime.now());

    final first = DateTime(month.year, month.month);
    final start =
        first.subtract(Duration(days: first.weekday - DateTime.monday));
    final total = daysInMonth(month.year, month.month);
    // Five rows covers most months; six when the month spills over.
    final rows = ((first.weekday - DateTime.monday + total) / 7).ceil();

    return AFPanel(
      label: _name.format(month),
      count: '${month.year}',
      padding: const EdgeInsets.all(14),
      onTap: () {
        ref.read(calendarAnchorProvider.notifier).state = first;
        ref.read(calendarViewProvider.notifier).state = CalendarView.month;
      },
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              for (final label in const ['M', 'T', 'W', 'T', 'F', 'S', 'S'])
                Expanded(
                  child: Text(
                    label,
                    textAlign: TextAlign.center,
                    style: AFText.mono(size: 9, color: t.muted),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 6),
          for (var row = 0; row < rows; row++)
            Row(
              children: [
                for (var col = 0; col < 7; col++)
                  Expanded(
                    child: _miniCell(
                      context,
                      dayKey(start.add(Duration(days: row * 7 + col))),
                      today,
                    ),
                  ),
              ],
            ),
        ],
      ),
    );
  }

  Widget _miniCell(BuildContext context, DateTime day, DateTime today) {
    final t = context.af;
    final inMonth = day.month == month.month && day.year == month.year;
    final hasEntries = (buckets[day] ?? const []).isNotEmpty;
    final isToday = isSameDay(day, today);

    return SizedBox(
      height: 22,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 16,
            height: 14,
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
                size: 9.5,
                color: isToday
                    ? t.onInk
                    : (inMonth ? t.ink : t.muted.withValues(alpha: 0.45)),
              ),
            ),
          ),
          const SizedBox(height: 1),
          Container(
            width: 4,
            height: 4,
            decoration: BoxDecoration(
              color: hasEntries && inMonth ? t.accent : Colors.transparent,
              shape: BoxShape.circle,
            ),
          ),
        ],
      ),
    );
  }
}

// ---- agenda side panel (month view) ----

class _AgendaPanel extends ConsumerWidget {
  final DateTime day;

  const _AgendaPanel({required this.day});

  static final DateFormat _label = DateFormat('EEE d MMM');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final entries =
        ref.watch(agendaForDayProvider(day)).valueOrNull ?? const [];

    return AFPanel(
      label: _label.format(day),
      count: entries.isEmpty ? '—' : '${entries.length}',
      child: entries.isEmpty
          ? const Padding(
              padding: EdgeInsets.symmetric(vertical: 28),
              child: AFEmptyState(
                message: 'Nothing on this day.\nTap “New event” to add one.',
              ),
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final entry in entries)
                  _AgendaRow(entry: entry, day: day),
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
          onTap: () => openAgendaEntry(context, entry, day),
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
                          entry.allDay
                              ? 'all\nday'
                              : _time.format(entry.start),
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
                            : (entry.category?.label ?? 'event'),
                        color: agendaEntryColor(context, entry),
                      ),
                    ],
                  ),
                ),
                PositionedDirectional(
                  start: 0,
                  top: 0,
                  bottom: 0,
                  width: 3,
                  child: ColoredBox(color: agendaEntryColor(context, entry)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Reads the colours back out. The grids and time blocks carry colour but no
/// label, so without this the classification is only legible in the agenda.
class _CategoryLegend extends ConsumerWidget {
  const _CategoryLegend();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.af;
    final categories =
        ref.watch(categoriesProvider).valueOrNull ?? builtInCategories;

    return Wrap(
      spacing: 14,
      runSpacing: 8,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        Text(
          'CATEGORIES',
          style: AFText.mono(
            size: 10,
            color: t.muted,
            weight: FontWeight.w700,
            letterSpacing: 1.4,
          ),
        ),
        for (final category in categories)
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              CategoryDot(category: category, size: 8),
              const SizedBox(width: 6),
              Text(
                category.label,
                style: AFText.mono(size: 11, color: t.muted),
              ),
            ],
          ),
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                color: t.accent,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 6),
            Text(
              'Proctor session',
              style: AFText.mono(size: 11, color: t.muted),
            ),
          ],
        ),
      ],
    );
  }
}
