import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../models/habit.dart';
import '../../models/habit_day.dart';
import 'habit_provider.dart';
import 'habit_time.dart';

/// The zoom levels the habit chart and table are read at.
///
/// Deliberately its own enum rather than the calendar's [CalendarView]: habits
/// never appear on the calendar, and borrowing that type would tie two programs
/// together for the sake of five shared labels.
enum HabitRange {
  year(label: 'Year', short: 'Y', days: 365),
  month(label: 'Month', short: 'M', days: 30),
  week(label: 'Week', short: 'W', days: 7),
  threeDay(label: '3 Day', short: '3D', days: 3),
  day(label: 'Day', short: 'D', days: 1);

  const HabitRange({
    required this.label,
    required this.short,
    required this.days,
  });

  final String label;

  /// Used when the switcher has to fit on a phone.
  final String short;

  /// How many days back the range covers, today included.
  final int days;

  /// Year is bucketed by month so the chart stays readable — 365 bars in a
  /// panel is a smear. Everything shorter gets one bar per day.
  bool get isMonthly => this == HabitRange.year;
}

final habitRangeProvider =
    StateProvider<HabitRange>((ref) => HabitRange.week);

/// One column of the chart.
class HabitBucket {
  /// Axis tick — a weekday letter, a day number, or a month initial.
  final String label;

  /// Screen-reader and tooltip text.
  final String fullLabel;

  /// 0..1, or null when nothing in the bucket can be scored.
  final double? completion;

  /// Whether this bucket contains today, which the chart marks.
  final bool isToday;

  const HabitBucket({
    required this.label,
    required this.fullLabel,
    required this.completion,
    this.isToday = false,
  });
}

final _dayTick = DateFormat('d');
final _weekdayTick = DateFormat('E');
final _monthTick = DateFormat('MMM');
final _fullDay = DateFormat('EEE d MMM');
final _fullMonth = DateFormat('MMMM y');

/// The chart series for the selected range, oldest bucket first.
final habitSeriesProvider = FutureProvider<List<HabitBucket>>((ref) async {
  final range = ref.watch(habitRangeProvider);
  final habits = await ref.watch(habitsProvider.future);
  final days = await ref.watch(habitDaysProvider.future);

  return range.isMonthly
      ? _monthlyBuckets(habits, days)
      : _dailyBuckets(range, habits, days);
});

List<HabitBucket> _dailyBuckets(
  HabitRange range,
  List<Habit> habits,
  Map<String, HabitDay> days,
) {
  final today = jakartaDayKey();
  // recentDayKeys counts back from today, so reverse for a left-to-right axis.
  final keys = recentDayKeys(range.days).reversed.toList();

  return [
    for (final key in keys)
      HabitBucket(
        // Day numbers collide visually across a month boundary; weekday letters
        // do not, and a week-long range reads better by weekday anyway.
        label: range.days <= 7
            ? _weekdayTick.format(dayFromKey(key)).substring(0, 1)
            : _dayTick.format(dayFromKey(key)),
        fullLabel: _fullDay.format(dayFromKey(key)),
        completion: completionFor(key, habits, days),
        isToday: key == today,
      ),
  ];
}

/// Twelve buckets ending with the current month, each the mean of the days in
/// it that were actually scored.
///
/// Days with no record are skipped rather than counted as zero: a month you did
/// not open the app should not read as a month of total failure.
List<HabitBucket> _monthlyBuckets(
  List<Habit> habits,
  Map<String, HabitDay> days,
) {
  final now = jakartaNow();
  final buckets = <HabitBucket>[];

  for (var i = 11; i >= 0; i--) {
    final month = DateTime(now.year, now.month - i);
    final scores = <double>[];

    for (final entry in days.entries) {
      final date = dayFromKey(entry.key);
      if (date.year != month.year || date.month != month.month) continue;
      final score = completionFor(entry.key, habits, days);
      if (score != null) scores.add(score);
    }

    buckets.add(
      HabitBucket(
        label: _monthTick.format(month).substring(0, 1),
        fullLabel: _fullMonth.format(month),
        completion: scores.isEmpty
            ? null
            : scores.reduce((a, b) => a + b) / scores.length,
        isToday: month.year == now.year && month.month == now.month,
      ),
    );
  }

  return buckets;
}
