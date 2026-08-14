import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../db/database_helper.dart';
import '../../models/habit.dart';
import '../../models/habit_day.dart';
import '../../sync/sync_controller.dart';
import 'habit_time.dart';

const _uuid = Uuid();

/// Which Jakarta day it is *right now*, re-emitted the moment it changes.
///
/// Every surface that means "today" watches this rather than calling
/// [jakartaDayKey] itself. Without it the labels are computed once at build
/// time and never again: an app left open past midnight keeps calling yesterday
/// `@Today`, and — worse — the tick handler holds the old day key in its
/// closure, so a habit ticked at 00:05 lands on the wrong day.
class CurrentDay extends StateNotifier<String> {
  /// Injectable only so the rollover can be driven in a test — waiting for a
  /// real midnight is not a test.
  final DateTime Function() _clock;

  Timer? _timer;

  CurrentDay({DateTime Function()? clock})
      : _clock = clock ?? DateTime.now,
        super(jakartaDayKey((clock ?? DateTime.now)())) {
    _schedule();
  }

  /// Re-reads the clock and reschedules.
  ///
  /// Also called when the app comes back to the foreground: a suspended phone
  /// or a throttled browser tab will not have run the timer on time, so the
  /// rollover has to be caught up as well as scheduled.
  void refresh() {
    final today = jakartaDayKey(_clock());
    if (today != state) state = today;
    _schedule();
  }

  void _schedule() {
    _timer?.cancel();
    // A second past the boundary, and never shorter than that: firing a hair
    // early would re-read the same day and immediately schedule a zero-length
    // timer, which is a busy loop.
    final delay = untilNextJakartaMidnight(_clock()) + const Duration(seconds: 1);
    _timer = Timer(
      delay < const Duration(seconds: 1) ? const Duration(seconds: 1) : delay,
      refresh,
    );
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }
}

final currentDayProvider =
    StateNotifierProvider<CurrentDay, String>((ref) => CurrentDay());

final habitsProvider = FutureProvider<List<Habit>>((ref) async {
  return DatabaseHelper.instance.getHabits();
});

/// Every day record, keyed by day. Read by the chart and the habit table.
final habitDaysProvider = FutureProvider<Map<String, HabitDay>>((ref) async {
  return {
    for (final day in DatabaseHelper.instance.getHabitDays()) day.day: day,
  };
});

/// The habit ids ticked on one day, filtered to habits that still exist.
///
/// The filter is what lets a deleted habit's marks vanish everywhere without
/// rewriting a single day record.
final habitMarksProvider =
    FutureProvider.family<Set<String>, String>((ref, day) async {
  final habits = await ref.watch(habitsProvider.future);
  final days = await ref.watch(habitDaysProvider.future);

  final live = {for (final habit in habits) habit.id};
  return (days[day]?.completed ?? const <String>[])
      .where(live.contains)
      .toSet();
});

/// Today's marks, for the dashboard checklist. Follows the rollover.
final todayMarksProvider = FutureProvider<Set<String>>((ref) async {
  return ref.watch(habitMarksProvider(ref.watch(currentDayProvider)).future);
});

/// How much of a day was completed, 0..1. Null when there are no habits at all,
/// which the chart draws as an empty slot rather than as a zero.
double? completionFor(
  String day,
  List<Habit> habits,
  Map<String, HabitDay> days,
) {
  if (habits.isEmpty) return null;
  final live = {for (final habit in habits) habit.id};
  final marks = (days[day]?.completed ?? const <String>[]).where(live.contains);
  return marks.length / habits.length;
}

class HabitController {
  final Ref ref;

  HabitController(this.ref);

  Future<Habit> create({required String name, int toneIndex = 0}) async {
    final db = DatabaseHelper.instance;
    final now = DateTime.now();
    final existing = db.getHabits();

    final habit = Habit(
      id: _uuid.v4(),
      name: name.trim(),
      toneIndex: toneIndex,
      sortOrder: existing.isEmpty ? 0 : existing.last.sortOrder + 1,
      createdAt: now,
      updatedAt: now,
    );

    await db.putHabit(habit);
    _refresh();
    return habit;
  }

  Future<void> rename(String id, String name, int toneIndex) async {
    final habit = DatabaseHelper.instance.habitsBox.get(id);
    if (habit == null) return;
    habit
      ..name = name.trim()
      ..toneIndex = toneIndex
      ..updatedAt = DateTime.now();
    await habit.save();
    _refresh();
  }

  Future<void> delete(String id) async {
    await DatabaseHelper.instance.deleteHabit(id);
    _refresh();
  }

  /// Moves a habit one slot up or down.
  ///
  /// Rewrites the whole run of `sortOrder`s rather than swapping two, so the
  /// ordering stays dense and a later insert cannot collide with a gap.
  Future<void> move(String id, int delta) async {
    final db = DatabaseHelper.instance;
    final habits = db.getHabits();
    final index = habits.indexWhere((h) => h.id == id);
    final target = index + delta;
    if (index < 0 || target < 0 || target >= habits.length) return;

    final reordered = [...habits];
    reordered.insert(target, reordered.removeAt(index));

    final now = DateTime.now();
    for (var i = 0; i < reordered.length; i++) {
      if (reordered[i].sortOrder == i) continue;
      reordered[i]
        ..sortOrder = i
        ..updatedAt = now;
      await reordered[i].save();
    }
    _refresh();
  }

  /// Ticks or unticks one habit on one day.
  ///
  /// Writes a single [HabitDay], not a record per habit — the day is the unit
  /// of storage and of conflict resolution both.
  Future<void> toggle(String habitId, String day) async {
    final db = DatabaseHelper.instance;
    final existing = db.getHabitDay(day);
    final now = DateTime.now();

    if (existing == null) {
      // Never write an empty day: an untick on a day with no record is a no-op,
      // and days you have not touched stay absent from storage entirely.
      await db.putHabitDay(
        HabitDay(day: day, completed: [habitId], updatedAt: now),
      );
    } else {
      final completed = [...existing.completed];
      // remove() reports whether it was there, which makes this a toggle.
      if (!completed.remove(habitId)) completed.add(habitId);
      existing
        ..completed = completed
        ..updatedAt = now;
      await existing.save();
    }

    _refresh();
  }

  void _refresh() {
    ref
      ..invalidate(habitsProvider)
      ..invalidate(habitDaysProvider);
    ref.read(syncControllerProvider.notifier).requestSync();
  }
}

final habitControllerProvider = Provider((ref) => HabitController(ref));
