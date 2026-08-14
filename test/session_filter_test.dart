import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';

import 'package:af/db/database_helper.dart';
import 'package:af/db/session_maintenance.dart';
import 'package:af/models/calendar_event.dart';
import 'package:af/models/checklist_item.dart';
import 'package:af/models/custom_category.dart';
import 'package:af/models/checklist_template_item.dart';
import 'package:af/models/frequent_course.dart';
import 'package:af/models/habit.dart';
import 'package:af/models/habit_day.dart';
import 'package:af/models/proctor_session.dart';
import 'package:af/programs/calendar/calendar_provider.dart';
import 'package:af/providers/session_provider.dart';

/// Pins the rule behind "Mark as finished": a finished session must disappear
/// from Today and Upcoming, and only ever surface under Archived.
void main() {
  late ProviderContainer container;

  setUpAll(() async {
    final directory = Directory.systemTemp.createTempSync('af_filter_test');
    Hive.init(directory.path);

    Hive.registerAdapter(ProctorSessionAdapter());
    Hive.registerAdapter(ChecklistItemAdapter());
    Hive.registerAdapter(ChecklistTemplateItemAdapter());
    Hive.registerAdapter(FrequentCourseAdapter());
    Hive.registerAdapter(CalendarEventAdapter());
    Hive.registerAdapter(CustomCategoryAdapter());
    Hive.registerAdapter(HabitAdapter());
    Hive.registerAdapter(HabitDayAdapter());

    final db = DatabaseHelper.instance;
    db.sessionsBox = await Hive.openBox<ProctorSession>('proctor_sessions');
    db.checklistItemsBox = await Hive.openBox<ChecklistItem>('checklist_items');
    db.templateBox =
        await Hive.openBox<ChecklistTemplateItem>('checklist_template');
    db.frequentCoursesBox =
        await Hive.openBox<FrequentCourse>('frequent_courses');
    db.calendarEventsBox =
        await Hive.openBox<CalendarEvent>('calendar_events');
    db.customCategoriesBox =
        await Hive.openBox<CustomCategory>('event_categories');
    db.settingsBox = await Hive.openBox('af_settings');
    db.habitsBox = await Hive.openBox<Habit>('habits');
    db.habitDaysBox = await Hive.openBox<HabitDay>('habit_days');
  });

  setUp(() async {
    await DatabaseHelper.instance.sessionsBox.clear();
    await DatabaseHelper.instance.checklistItemsBox.clear();
    container = ProviderContainer();
    addTearDown(container.dispose);
  });

  Future<String> addSession({required DateTime at}) async {
    return DatabaseHelper.instance.insertSession(
      ProctorSession(
        type: 'UAS',
        dateTime: at,
        room: '724',
        courseCode: 'COSC6092001',
        courseName: 'Code Reengineering',
        courseClass: 'BB01',
        createdAt: DateTime.now(),
        syncId: 'test-${at.microsecondsSinceEpoch}',
        updatedAt: DateTime.now(),
      ),
    );
  }

  Future<void> addItem(String sessionKey, {String label = 'Check the room'}) {
    return DatabaseHelper.instance.insertChecklistItem(
      ChecklistItem(
        sessionKey: sessionKey,
        label: label,
        section: 'Before',
        sortOrder: 0,
        syncId: 'item-$sessionKey-$label',
        updatedAt: DateTime.now(),
      ),
    );
  }

  Future<List<ProctorSession>> read(SessionFilter filter) {
    container.read(sessionFilterProvider.notifier).state = filter;
    return container.read(filteredSessionsProvider.future);
  }

  test('an upcoming session shows under Upcoming', () async {
    await addSession(at: DateTime.now().add(const Duration(days: 3)));
    expect(await read(SessionFilter.upcoming), hasLength(1));
  });

  test('marking finished removes it from Upcoming', () async {
    final key = await addSession(at: DateTime.now().add(const Duration(days: 3)));

    await container.read(sessionControllerProvider).setFinished(key, true);

    expect(await read(SessionFilter.upcoming), isEmpty);
    expect(await read(SessionFilter.today), isEmpty);
    expect(await read(SessionFilter.archived), hasLength(1));
  });

  test('marking finished removes a same-day session from Today', () async {
    final now = DateTime.now();
    final key = await addSession(
      at: DateTime(now.year, now.month, now.day, 23, 30),
    );
    expect(await read(SessionFilter.today), hasLength(1));

    await container.read(sessionControllerProvider).setFinished(key, true);

    expect(await read(SessionFilter.today), isEmpty);
    expect(await read(SessionFilter.archived), hasLength(1));
  });

  test('a session more than four hours old auto-archives on read', () async {
    await addSession(at: DateTime.now().subtract(const Duration(hours: 5)));

    // The sweep runs as part of reading the lists.
    expect(await read(SessionFilter.today), isEmpty);
    expect(await read(SessionFilter.archived), hasLength(1));
  });

  // Asserted against the active list rather than the Today filter: "recent" and
  // "scheduled today" only coincide for part of the day, so the Today filter
  // makes this fail whenever the suite runs in the early morning.
  test('a session inside the four-hour window stays active', () async {
    await addSession(at: DateTime.now().subtract(const Duration(hours: 3)));

    expect(await container.read(activeSessionsProvider.future), hasLength(1));
    expect(await read(SessionFilter.archived), isEmpty);
  });

  test('a future session is never swept', () async {
    await addSession(at: DateTime.now().add(const Duration(days: 2)));

    expect(await read(SessionFilter.upcoming), hasLength(1));
    expect(await read(SessionFilter.archived), isEmpty);
  });

  test('the sweep is idempotent', () async {
    await addSession(at: DateTime.now().subtract(const Duration(hours: 9)));

    expect(await archiveStaleSessions(), 1);
    expect(await archiveStaleSessions(), 0);
  });

  // The case that makes the exemption necessary: anything worth reopening is
  // already past the cutoff, so without it the sweep would undo the reopen.
  test('a reopened stale session is exempt from the sweep', () async {
    final key =
        await addSession(at: DateTime.now().subtract(const Duration(hours: 9)));
    final controller = container.read(sessionControllerProvider);

    await controller.setFinished(key, true);
    await controller.setFinished(key, false);

    expect(await archiveStaleSessions(), 0);
    // Nine hours ago is yesterday for most of the morning, so this checks that
    // the session is still active rather than that it lands under Today.
    expect(await container.read(activeSessionsProvider.future), hasLength(1));
  });

  test('finishing a reopened session by hand clears the exemption', () async {
    final key =
        await addSession(at: DateTime.now().subtract(const Duration(hours: 9)));
    final controller = container.read(sessionControllerProvider);

    await controller.setFinished(key, false);
    await controller.setFinished(key, true);

    expect(await read(SessionFilter.archived), hasLength(1));
    expect(
      DatabaseHelper.instance.sessionsBox.values.first.reopened,
      isFalse,
    );
  });

  test('reopening puts it back', () async {
    final key = await addSession(at: DateTime.now().add(const Duration(days: 3)));
    final controller = container.read(sessionControllerProvider);

    await controller.setFinished(key, true);
    await controller.setFinished(key, false);

    expect(await read(SessionFilter.upcoming), hasLength(1));
    expect(await read(SessionFilter.archived), isEmpty);
  });

  // Deleting is a tombstone, not a removal: the row has to survive so the
  // deletion can reach the account's other devices. Everything that reads
  // sessions therefore has to filter it out.
  group('delete', () {
    final db = DatabaseHelper.instance;

    test('removes it from every filter', () async {
      final key = await addSession(at: DateTime.now().add(const Duration(days: 3)));

      await container.read(sessionControllerProvider).delete(key);

      expect(await read(SessionFilter.upcoming), isEmpty);
      expect(await read(SessionFilter.today), isEmpty);
      expect(await read(SessionFilter.archived), isEmpty);
    });

    test('keeps the row so the deletion can propagate', () async {
      final key = await addSession(at: DateTime.now().add(const Duration(days: 3)));

      await container.read(sessionControllerProvider).delete(key);

      expect(db.sessionsBox.length, 1);
      expect(db.sessionsBox.values.first.deleted, isTrue);
      expect(db.sessionsBox.values.first.updatedAt, isNotNull);
    });

    test('finds an archived session too, not just an active one', () async {
      final key = await addSession(at: DateTime.now().add(const Duration(days: 3)));
      final controller = container.read(sessionControllerProvider);

      await controller.setFinished(key, true);
      await controller.delete(key);

      expect(await read(SessionFilter.archived), isEmpty);
    });

    test('cascades to the checklist items', () async {
      final key = await addSession(at: DateTime.now().add(const Duration(days: 3)));
      await addItem(key, label: 'Collect the papers');
      await addItem(key, label: 'Seat the students');
      expect(db.getChecklistItems(key), hasLength(2));

      await container.read(sessionControllerProvider).delete(key);

      expect(db.getChecklistItems(key), isEmpty);
      expect(db.checklistItemsBox.length, 2);
      expect(db.checklistItemsBox.values.every((i) => i.deleted), isTrue);
    });

    test('leaves another session\'s items alone', () async {
      final keep = await addSession(at: DateTime.now().add(const Duration(days: 1)));
      final drop = await addSession(at: DateTime.now().add(const Duration(days: 2)));
      await addItem(keep);
      await addItem(drop);

      await container.read(sessionControllerProvider).delete(drop);

      expect(db.getChecklistItems(keep), hasLength(1));
      expect(db.getChecklistItems(drop), isEmpty);
    });

    test('a deleted session cannot be opened by its URL key', () async {
      final key = await addSession(at: DateTime.now().add(const Duration(days: 3)));
      expect(db.getSessionByKey(int.parse(key)), isNotNull);

      await container.read(sessionControllerProvider).delete(key);

      expect(db.getSessionByKey(int.parse(key)), isNull);
    });

    test('drops out of the dashboard agenda', () async {
      final key = await addSession(at: DateTime.now().add(const Duration(days: 3)));
      expect(await container.read(upcomingAgendaProvider.future), hasLength(1));

      await container.read(sessionControllerProvider).delete(key);
      container.invalidate(agendaProvider);

      expect(await container.read(upcomingAgendaProvider.future), isEmpty);
    });

    // Otherwise the sweep rewrites updatedAt on every tombstone at every read,
    // pushing dead writes and potentially beating a real edit elsewhere.
    test('the stale sweep skips tombstones', () async {
      final key =
          await addSession(at: DateTime.now().subtract(const Duration(hours: 9)));

      await container.read(sessionControllerProvider).delete(key);
      final stamp = db.sessionsBox.values.first.updatedAt;

      expect(await archiveStaleSessions(), 0);
      expect(db.sessionsBox.values.first.status, 'active');
      expect(db.sessionsBox.values.first.updatedAt, stamp);
    });

    test('deleting twice is a no-op', () async {
      final key = await addSession(at: DateTime.now().add(const Duration(days: 3)));
      final controller = container.read(sessionControllerProvider);

      await controller.delete(key);
      final stamp = db.sessionsBox.values.first.updatedAt;
      await controller.delete(key);

      expect(db.sessionsBox.values.first.updatedAt, stamp);
    });
  });

  // The dashboard's "Up next" reads the merged agenda, which carries archived
  // sessions so the calendar can still draw them on their day. Filtering by
  // time alone is therefore not enough: a session finished early is still in
  // the future.
  group('dashboard up next', () {
    Future<List<AgendaEntry>> upNext() =>
        container.read(upcomingAgendaProvider.future);

    test('lists a session that is still to come', () async {
      await addSession(at: DateTime.now().add(const Duration(days: 3)));
      expect(await upNext(), hasLength(1));
    });

    test('drops a session marked as finished ahead of its time', () async {
      final key =
          await addSession(at: DateTime.now().add(const Duration(days: 3)));

      await container.read(sessionControllerProvider).setFinished(key, true);
      container.invalidate(agendaProvider);

      expect(await upNext(), isEmpty);
    });

    test('brings it back when reopened', () async {
      final key =
          await addSession(at: DateTime.now().add(const Duration(days: 3)));
      final controller = container.read(sessionControllerProvider);

      await controller.setFinished(key, true);
      await controller.setFinished(key, false);
      container.invalidate(agendaProvider);

      expect(await upNext(), hasLength(1));
    });
  });
}
