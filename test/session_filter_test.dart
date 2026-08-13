import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';

import 'package:af/db/database_helper.dart';
import 'package:af/db/session_maintenance.dart';
import 'package:af/models/calendar_event.dart';
import 'package:af/models/checklist_item.dart';
import 'package:af/models/checklist_template_item.dart';
import 'package:af/models/frequent_course.dart';
import 'package:af/models/proctor_session.dart';
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

    final db = DatabaseHelper.instance;
    db.sessionsBox = await Hive.openBox<ProctorSession>('proctor_sessions');
    db.checklistItemsBox = await Hive.openBox<ChecklistItem>('checklist_items');
    db.templateBox =
        await Hive.openBox<ChecklistTemplateItem>('checklist_template');
    db.frequentCoursesBox =
        await Hive.openBox<FrequentCourse>('frequent_courses');
    db.calendarEventsBox =
        await Hive.openBox<CalendarEvent>('calendar_events');
    db.settingsBox = await Hive.openBox('af_settings');
  });

  setUp(() async {
    await DatabaseHelper.instance.sessionsBox.clear();
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

  test('a session inside the four-hour window stays active', () async {
    await addSession(at: DateTime.now().subtract(const Duration(hours: 3)));

    expect(await read(SessionFilter.today), hasLength(1));
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
    expect(await read(SessionFilter.today), hasLength(1));
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
}
