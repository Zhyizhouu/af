import '../models/proctor_session.dart';
import 'package:hive_flutter/hive_flutter.dart';
import '../models/calendar_event.dart';
import '../models/checklist_item.dart';
import '../models/checklist_template_item.dart';
import '../models/frequent_course.dart';

class DatabaseHelper {
  static final DatabaseHelper instance = DatabaseHelper._init();
  DatabaseHelper._init();

  late Box<ProctorSession> sessionsBox;
  late Box<ChecklistItem> checklistItemsBox;
  late Box<ChecklistTemplateItem> templateBox;
  late Box<FrequentCourse> frequentCoursesBox;

  late Box<CalendarEvent> calendarEventsBox;

  /// App-wide preferences shared by every program (theme mode, QR defaults).
  late Box settingsBox;

  Future<void> init() async {
    await Hive.initFlutter();

    Hive.registerAdapter(ProctorSessionAdapter());
    Hive.registerAdapter(ChecklistItemAdapter());
    Hive.registerAdapter(ChecklistTemplateItemAdapter());
    Hive.registerAdapter(FrequentCourseAdapter());
    Hive.registerAdapter(CalendarEventAdapter());

    calendarEventsBox = await Hive.openBox<CalendarEvent>('calendar_events');
    sessionsBox = await Hive.openBox<ProctorSession>('proctor_sessions');
    checklistItemsBox = await Hive.openBox<ChecklistItem>('checklist_items');
    templateBox = await Hive.openBox<ChecklistTemplateItem>(
      'checklist_template',
    );
    frequentCoursesBox = await Hive.openBox<FrequentCourse>('frequent_courses');
    settingsBox = await Hive.openBox('af_settings');
  }

  // ---- Calendar ----

  /// Live events, tombstones excluded, earliest first.
  List<CalendarEvent> getCalendarEvents() {
    final events =
        calendarEventsBox.values.where((event) => !event.deleted).toList();
    events.sort((a, b) => a.start.compareTo(b.start));
    return events;
  }

  Future<void> putCalendarEvent(CalendarEvent event) async {
    // Keyed by UUID rather than appended, so the same call both inserts and
    // updates — which is what a sync pull will need to do later.
    await calendarEventsBox.put(event.id, event);
  }

  /// Tombstones the event rather than removing the row. See [CalendarEvent].
  Future<void> deleteCalendarEvent(String id) async {
    final event = calendarEventsBox.get(id);
    if (event == null) return;
    event.deleted = true;
    event.updatedAt = DateTime.now();
    await event.save();
  }

  // ---- Settings ----
  T? getSetting<T>(String key) => settingsBox.get(key) as T?;

  Future<void> setSetting(String key, Object? value) =>
      settingsBox.put(key, value);

  // ---- Template ----
  Future<void> insertTemplateItem(ChecklistTemplateItem item) async {
    await templateBox.add(item);
  }

  List<ChecklistTemplateItem> getTemplate({required String type}) {
    final items = templateBox.values.where((i) => i.type == type).toList();
    items.sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    return items;
  }

  Future<void> deleteTemplateItem(dynamic key) async {
    await templateBox.delete(key);
  }

  // ---- Sessions ----
  Future<String> insertSession(ProctorSession session) async {
    final key = await sessionsBox.add(session);
    return key.toString();
  }

  List<ProctorSession> getSessions(String status) {
    final sessions = sessionsBox.values
        .where((s) => s.status == status)
        .toList();
    sessions.sort((a, b) => a.dateTime.compareTo(b.dateTime));
    return sessions;
  }

  ProctorSession? getSessionByKey(dynamic key) {
    return sessionsBox.get(key);
  }

  Future<void> updateSessionStatus(dynamic key, String status) async {
    final session = sessionsBox.get(key);
    if (session != null) {
      session.status = status;
      await session.save();
    }
  }

  // ---- Checklist items ----
  Future<void> insertChecklistItem(ChecklistItem item) async {
    await checklistItemsBox.add(item);
  }

  List<ChecklistItem> getChecklistItems(String sessionKey) {
    final items = checklistItemsBox.values
        .where((i) => i.sessionKey == sessionKey)
        .toList();
    items.sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    return items;
  }

  Future<void> updateChecklistItem(ChecklistItem item) async {
    await item.save();
  }

  // ---- Frequent Courses ----
  Future<void> insertFrequentCourse(
    String code,
    String name,
    String courseClass,
  ) async {
    final exists = frequentCoursesBox.values.any(
      (c) =>
          c.courseCode == code &&
          c.courseName == name &&
          c.courseClass == courseClass,
    );
    if (!exists) {
      await frequentCoursesBox.add(
        FrequentCourse(
          courseCode: code,
          courseName: name,
          courseClass: courseClass,
        ),
      );
    }
  }

  List<FrequentCourse> getFrequentCourses() {
    return frequentCoursesBox.values.toList().reversed.toList();
  }

  Future<void> deleteFrequentCourse(dynamic key) async {
    await frequentCoursesBox.delete(key);
  }
}
