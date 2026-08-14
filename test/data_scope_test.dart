import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';

import 'package:af/db/database_helper.dart';
import 'package:af/models/calendar_event.dart';
import 'package:af/models/checklist_item.dart';
import 'package:af/models/checklist_template_item.dart';
import 'package:af/models/custom_category.dart';
import 'package:af/models/frequent_course.dart';
import 'package:af/models/habit.dart';
import 'package:af/models/habit_day.dart';
import 'package:af/models/proctor_session.dart';

/// Account scoping: two accounts on one device must never see, or push, each
/// other's records.
void main() {
  final db = DatabaseHelper.instance;

  setUpAll(() async {
    Hive.init(Directory.systemTemp.createTempSync('af_scope_test').path);
    Hive.registerAdapter(ProctorSessionAdapter());
    Hive.registerAdapter(ChecklistItemAdapter());
    Hive.registerAdapter(ChecklistTemplateItemAdapter());
    Hive.registerAdapter(FrequentCourseAdapter());
    Hive.registerAdapter(CalendarEventAdapter());
    Hive.registerAdapter(CustomCategoryAdapter());
    Hive.registerAdapter(HabitAdapter());
    Hive.registerAdapter(HabitDayAdapter());
  });

  Future<void> addHabit(String name) => db.putHabit(
        Habit(
          id: 'habit-$name',
          name: name,
          createdAt: DateTime(2026, 8, 14),
          updatedAt: DateTime(2026, 8, 14),
        ),
      );

  Future<void> addEvent(String id) => db.putCalendarEvent(
        CalendarEvent(
          id: id,
          title: id,
          start: DateTime(2026, 8, 14, 9),
          end: DateTime(2026, 8, 14, 10),
          createdAt: DateTime(2026, 8, 14),
          updatedAt: DateTime(2026, 8, 14),
        ),
      );

  // Data written before scoping existed lives in unsuffixed boxes. The local
  // scope reuses exactly those names, so it is adopted with no migration —
  // which is the whole reason there is no migration step to go wrong.
  group('pre-scoping data', () {
    test('the local scope keeps the original box names', () {
      expect(DatabaseHelper.boxName('habits', DatabaseHelper.localScope),
          'habits');
      expect(DatabaseHelper.boxName('calendar_events', 'user-x'),
          'calendar_events__user-x');
    });

    test('an unsuffixed box is picked up as the local scope', () async {
      // Exactly the shape an install predating scoping has on disk.
      final legacy = await Hive.openBox<CalendarEvent>('calendar_events');
      await legacy.put(
        'keep-this-key',
        CalendarEvent(
          id: 'keep-this-key',
          title: 'Written before scoping',
          start: DateTime(2026, 8, 1, 9),
          end: DateTime(2026, 8, 1, 10),
          createdAt: DateTime(2026, 8, 1),
          updatedAt: DateTime(2026, 8, 1),
        ),
      );
      await legacy.close();

      await db.openScope(DatabaseHelper.localScope);

      final found = db.calendarEventsBox.get('keep-this-key');
      expect(found, isNotNull);
      expect(found!.title, 'Written before scoping');
      // Keys survive because nothing moved: events are keyed by their sync id.
      expect(db.calendarEventsBox.keys, contains('keep-this-key'));
    });
  });

  group('isolation', () {
    test('two accounts never see each other\'s records', () async {
      await db.openScope('user-a');
      await addHabit('A only');
      await addEvent('event-a');
      expect(db.getHabits(), hasLength(1));

      await db.openScope('user-b');
      expect(db.getHabits(), isEmpty);
      expect(db.getCalendarEvents(), isEmpty);

      await addHabit('B only');
      expect(db.getHabits().single.name, 'B only');

      // And A's records are still there, untouched, when it comes back.
      await db.openScope('user-a');
      expect(db.getHabits().single.name, 'A only');
      expect(db.getCalendarEvents().single.id, 'event-a');
    });

    test('signing out keeps the account data on disk', () async {
      await db.openScope('user-c');
      await addHabit('C only');

      await db.openScope(DatabaseHelper.localScope);
      expect(db.getHabits().where((h) => h.name == 'C only'), isEmpty);

      await db.openScope('user-c');
      expect(db.getHabits().single.name, 'C only');
    });

    test('the scope getter reports what is loaded', () async {
      await db.openScope('user-d');
      expect(db.scope, 'user-d');
      await db.openScope(DatabaseHelper.localScope);
      expect(db.scope, 'local');
    });

    // The swap opens every new box before reassigning a field, so nothing can
    // read a closed box mid-switch.
    test('the boxes are open and usable straight after a switch', () async {
      await db.openScope('user-e');
      expect(db.habitsBox.isOpen, isTrue);
      expect(db.sessionsBox.isOpen, isTrue);
      expect(db.calendarEventsBox.isOpen, isTrue);
      expect(db.habitDaysBox.isOpen, isTrue);
      expect(db.customCategoriesBox.isOpen, isTrue);
      expect(db.checklistItemsBox.isOpen, isTrue);
      expect(db.frequentCoursesBox.isOpen, isTrue);
    });

    test('switching to the scope already open is a no-op', () async {
      await db.openScope('user-f');
      await addHabit('F only');
      final box = db.habitsBox;

      await db.openScope('user-f');

      expect(identical(db.habitsBox, box), isTrue);
      expect(db.getHabits(), hasLength(1));
    });
  });

}
