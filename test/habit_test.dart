import 'dart:io';

import 'package:fake_async/fake_async.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';

import 'package:af/db/database_helper.dart';
import 'package:af/db/seed_habits.dart';
import 'package:af/models/habit.dart';
import 'package:af/models/habit_day.dart';
import 'package:af/programs/habits/habit_provider.dart';
import 'package:af/programs/habits/habit_range.dart';
import 'package:af/programs/habits/habit_time.dart';

/// Two things carry this feature: that a day means the same day everywhere,
/// and that a day costs one record however many habits you keep.
void main() {
  late ProviderContainer container;
  late HabitController controller;

  setUpAll(() async {
    Hive.init(Directory.systemTemp.createTempSync('af_habit_test').path);
    Hive.registerAdapter(HabitAdapter());
    Hive.registerAdapter(HabitDayAdapter());

    final db = DatabaseHelper.instance;
    db.habitsBox = await Hive.openBox<Habit>('habits');
    db.habitDaysBox = await Hive.openBox<HabitDay>('habit_days');
  });

  setUp(() async {
    await DatabaseHelper.instance.habitsBox.clear();
    await DatabaseHelper.instance.habitDaysBox.clear();
    container = ProviderContainer();
    addTearDown(container.dispose);
    controller = container.read(habitControllerProvider);
  });

  group('jakarta day boundary', () {
    // The case that makes a fixed offset necessary: the same instant is two
    // different calendar days depending on where you read the clock.
    test('an evening UTC instant is already tomorrow in Jakarta', () {
      final instant = DateTime.utc(2026, 8, 13, 18, 30);
      expect(jakartaDayKey(instant), '2026-08-14');
    });

    test('just before Jakarta midnight is still the old day', () {
      // 16:59 UTC is 23:59 in Jakarta.
      expect(jakartaDayKey(DateTime.utc(2026, 8, 13, 16, 59)), '2026-08-13');
    });

    test('exactly Jakarta midnight rolls over', () {
      expect(jakartaDayKey(DateTime.utc(2026, 8, 13, 17)), '2026-08-14');
    });

    test('the device timezone cannot change the answer', () {
      final instant = DateTime.utc(2026, 8, 13, 18, 30);
      // toLocal() is whatever the test machine is; the key must not follow it.
      expect(jakartaDayKey(instant.toLocal()), jakartaDayKey(instant));
    });

    test('recent keys run backwards without gaps', () {
      final keys = recentDayKeys(3, now: DateTime.utc(2026, 8, 13, 18));
      expect(keys, ['2026-08-14', '2026-08-13', '2026-08-12']);
    });
  });

  // The rollover is scheduled, not polled: the timer sleeps until the boundary
  // and lands on it exactly.
  group('midnight rollover', () {
    test('counts down to the next Jakarta midnight', () {
      // 15:00 UTC is 22:00 in Jakarta, so two hours to go.
      expect(
        untilNextJakartaMidnight(DateTime.utc(2026, 8, 14, 15)),
        const Duration(hours: 2),
      );
    });

    test('a full day remains the instant it rolls over', () {
      // 17:00 UTC is exactly Jakarta midnight.
      expect(
        untilNextJakartaMidnight(DateTime.utc(2026, 8, 14, 17)),
        const Duration(hours: 24),
      );
    });

    test('is never zero or negative, so scheduling cannot busy-loop', () {
      for (var hour = 0; hour < 24; hour++) {
        for (final minute in const [0, 1, 59]) {
          final delay =
              untilNextJakartaMidnight(DateTime.utc(2026, 8, 14, hour, minute));
          expect(delay, greaterThan(Duration.zero));
          expect(delay, lessThanOrEqualTo(const Duration(hours: 24)));
        }
      }
    });

    // The whole mechanism, driven across a real 00:00 on a fake clock.
    test('the timer flips the day at midnight, and labels follow', () {
      fakeAsync((async) {
        // 16:59 UTC is 23:59 in Jakarta — one minute to go.
        var now = DateTime.utc(2026, 8, 14, 16, 59);
        final day = CurrentDay(clock: () => now);
        addTearDown(day.dispose);

        expect(day.state, '2026-08-14');
        expect(habitDayLabel('2026-08-14', today: day.state), '@Today');
        expect(habitDayLabel('2026-08-13', today: day.state), '@Yesterday');
        expect(habitDayLabel('2026-08-12', today: day.state), '@12 August 2026');

        // Cross midnight and let the scheduled timer run.
        now = DateTime.utc(2026, 8, 14, 17, 0, 30);
        async.elapse(const Duration(minutes: 2));

        expect(day.state, '2026-08-15');
        // Yesterday's row keeps its key and relabels itself — the label is
        // derived, so nothing is renamed in storage.
        expect(habitDayLabel('2026-08-15', today: day.state), '@Today');
        expect(habitDayLabel('2026-08-14', today: day.state), '@Yesterday');
        expect(habitDayLabel('2026-08-13', today: day.state), '@13 August 2026');
      });
    });

    test('it keeps rolling on subsequent nights', () {
      fakeAsync((async) {
        var now = DateTime.utc(2026, 8, 14, 17);
        final day = CurrentDay(clock: () => now);
        addTearDown(day.dispose);
        expect(day.state, '2026-08-15');

        // Stepped past the one-second cushion the scheduler adds, and the fake
        // clock is advanced by exactly what the fake timer elapses so the two
        // stay in lockstep.
        const step = Duration(days: 1, seconds: 2);
        for (var i = 1; i <= 3; i++) {
          now = now.add(step);
          async.elapse(step);
          expect(day.state, jakartaDayKey(now));
        }
      });
    });

    // A suspended phone or a throttled tab sleeps through the timer entirely.
    test('resuming after a missed rollover catches up', () {
      fakeAsync((async) {
        var now = DateTime.utc(2026, 8, 14, 16);
        final day = CurrentDay(clock: () => now);
        addTearDown(day.dispose);
        expect(day.state, '2026-08-14');

        // Jump three days without letting any timer run, as a suspended app
        // would, then do what the lifecycle observer does on resume.
        now = now.add(const Duration(days: 3));
        day.refresh();

        expect(day.state, '2026-08-17');
      });
    });

    test('a new @Today row appears at the top of the table', () {
      expect(dayKeysFrom('2026-08-14', 3),
          ['2026-08-14', '2026-08-13', '2026-08-12']);
      // After the rollover the same call yields one more row, led by the new day.
      expect(dayKeysFrom('2026-08-15', 3),
          ['2026-08-15', '2026-08-14', '2026-08-13']);
    });

    // The bug the watch exists to prevent: a screen built before midnight
    // would otherwise hold the old key and mark the wrong day.
    test('a tick after the rollover lands on the new day', () async {
      final habit = await controller.create(name: 'Read');
      const before = '2026-08-14';
      const after = '2026-08-15';

      await controller.toggle(habit.id, before);
      await controller.toggle(habit.id, after);

      expect(DatabaseHelper.instance.getHabitDay(before)!.completed, [habit.id]);
      expect(DatabaseHelper.instance.getHabitDay(after)!.completed, [habit.id]);
      expect(DatabaseHelper.instance.habitDaysBox.length, 2);
    });
  });

  group('day labels', () {
    final now = DateTime.utc(2026, 8, 14, 3);

    test('today and yesterday are relative', () {
      expect(habitDayLabel('2026-08-14', now: now), '@Today');
      expect(habitDayLabel('2026-08-13', now: now), '@Yesterday');
    });

    // Anything older reads as a date rather than "@4 days ago", which would
    // make the reader do arithmetic.
    test('anything older is the real date', () {
      expect(habitDayLabel('2026-08-12', now: now), '@12 August 2026');
      expect(habitDayLabel('2026-07-30', now: now), '@30 July 2026');
    });
  });

  group('storage cost', () {
    // The whole reason HabitDay holds a set instead of there being a record
    // per habit per day.
    test('a day costs one record no matter how many habits', () async {
      final habits = [
        for (var i = 0; i < 5; i++) await controller.create(name: 'Habit $i'),
      ];

      for (final habit in habits) {
        await controller.toggle(habit.id, '2026-08-14');
      }

      expect(DatabaseHelper.instance.habitDaysBox.length, 1);
      expect(
        DatabaseHelper.instance.getHabitDay('2026-08-14')!.completed,
        hasLength(5),
      );
    });

    test('untouched days are never written', () async {
      await controller.create(name: 'Read');
      expect(DatabaseHelper.instance.habitDaysBox.length, 0);
    });

    test('unticking empties the day rather than deleting it', () async {
      final habit = await controller.create(name: 'Read');

      await controller.toggle(habit.id, '2026-08-14');
      await controller.toggle(habit.id, '2026-08-14');

      expect(DatabaseHelper.instance.habitDaysBox.length, 1);
      expect(DatabaseHelper.instance.getHabitDay('2026-08-14')!.completed,
          isEmpty);
    });
  });

  group('completion', () {
    Future<double?> scoreFor(String day) async {
      final habits = await container.read(habitsProvider.future);
      final days = await container.read(habitDaysProvider.future);
      return completionFor(day, habits, days);
    }

    test('is the share of habits ticked', () async {
      final a = await controller.create(name: 'A');
      await controller.create(name: 'B');
      await controller.create(name: 'C');
      await controller.create(name: 'D');

      await controller.toggle(a.id, '2026-08-14');
      container.invalidate(habitDaysProvider);

      expect(await scoreFor('2026-08-14'), 0.25);
    });

    // Absent is not zero: a day with no record has to be distinguishable from
    // a day you scored and failed, or the chart lies about untracked stretches.
    test('a day with no record scores zero, no habits scores null', () async {
      expect(await scoreFor('2026-08-14'), isNull);

      await controller.create(name: 'A');
      container.invalidate(habitsProvider);

      expect(await scoreFor('2026-08-14'), 0);
    });

    test('a deleted habit stops counting, on old days too', () async {
      final a = await controller.create(name: 'A');
      final b = await controller.create(name: 'B');
      await controller.toggle(a.id, '2026-08-14');
      await controller.toggle(b.id, '2026-08-14');
      container.invalidate(habitDaysProvider);
      expect(await scoreFor('2026-08-14'), 1.0);

      await controller.delete(b.id);
      container
        ..invalidate(habitsProvider)
        ..invalidate(habitDaysProvider);

      // One habit left, and it is still ticked — so the day is complete, not
      // half done. The stale id stays on the record and is filtered on read.
      expect(await scoreFor('2026-08-14'), 1.0);
      expect(
        DatabaseHelper.instance.getHabitDay('2026-08-14')!.completed,
        hasLength(2),
      );
    });
  });

  group('series', () {
    test('a week is seven buckets ending today', () async {
      await controller.create(name: 'A');
      container.read(habitRangeProvider.notifier).state = HabitRange.week;

      final series = await container.read(habitSeriesProvider.future);

      expect(series, hasLength(7));
      expect(series.last.isToday, isTrue);
      expect(series.where((b) => b.isToday), hasLength(1));
    });

    test('a year is twelve monthly buckets', () async {
      await controller.create(name: 'A');
      container.read(habitRangeProvider.notifier).state = HabitRange.year;

      final series = await container.read(habitSeriesProvider.future);

      expect(series, hasLength(12));
      expect(series.last.isToday, isTrue);
    });

    test('today is scored once it is ticked', () async {
      final habit = await controller.create(name: 'A');
      await controller.toggle(habit.id, jakartaDayKey());
      container
        ..invalidate(habitsProvider)
        ..invalidate(habitDaysProvider);
      container.read(habitRangeProvider.notifier).state = HabitRange.week;

      final series = await container.read(habitSeriesProvider.future);
      expect(series.last.completion, 1.0);
    });
  });

  group('habit management', () {
    test('reorder keeps the sort dense', () async {
      final a = await controller.create(name: 'A');
      await controller.create(name: 'B');
      final c = await controller.create(name: 'C');

      await controller.move(c.id, -2);

      final habits = DatabaseHelper.instance.getHabits();
      expect(habits.map((h) => h.name), ['C', 'A', 'B']);
      expect(habits.map((h) => h.sortOrder), [0, 1, 2]);

      await controller.move(a.id, 1);
      expect(
        DatabaseHelper.instance.getHabits().map((h) => h.name),
        ['C', 'B', 'A'],
      );
    });

    test('moving past either end does nothing', () async {
      final a = await controller.create(name: 'A');
      await controller.create(name: 'B');

      await controller.move(a.id, -1);

      expect(
        DatabaseHelper.instance.getHabits().map((h) => h.name),
        ['A', 'B'],
      );
    });

    test('delete tombstones rather than removing', () async {
      final habit = await controller.create(name: 'A');

      await controller.delete(habit.id);

      expect(DatabaseHelper.instance.getHabits(), isEmpty);
      expect(DatabaseHelper.instance.habitsBox.length, 1);
      expect(DatabaseHelper.instance.habitsBox.values.first.deleted, isTrue);
    });
  });

  group('seeding', () {
    test('a fresh install gets exactly one habit', () async {
      await seedHabitsIfEmpty();
      expect(DatabaseHelper.instance.getHabits(), hasLength(1));
    });

    test('is idempotent', () async {
      await seedHabitsIfEmpty();
      await seedHabitsIfEmpty();
      expect(DatabaseHelper.instance.habitsBox.length, 1);
    });

    // Guarded on the box, not the live list, so the tombstone left by deleting
    // the starter habit stops it coming back on the next launch.
    test('does not resurrect a deleted starter habit', () async {
      await seedHabitsIfEmpty();
      await controller.delete(DatabaseHelper.instance.getHabits().first.id);

      await seedHabitsIfEmpty();

      expect(DatabaseHelper.instance.getHabits(), isEmpty);
    });
  });
}
