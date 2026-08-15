import '../models/proctor_session.dart';
import 'package:hive_flutter/hive_flutter.dart';
import '../models/calendar_event.dart';
import '../models/checklist_item.dart';
import '../models/custom_category.dart';
import '../models/checklist_template_item.dart';
import '../models/frequent_course.dart';
import '../models/habit.dart';
import '../models/ai_conversation.dart';
import '../models/habit_day.dart';

/// Local storage, scoped to whoever is signed in.
///
/// Every box holding user content is named `<base>__<scope>`, where the scope is
/// the Firebase uid, or [localScope] when nobody is signed in. Two accounts on
/// one device therefore never share a box — before this, they did, and signing
/// in as a second account merged the first one's records into its own Firestore
/// subtree on the next push.
///
/// Two boxes stay unscoped on purpose: [settingsBox] holds device preferences
/// like the theme, and [templateBox] holds the proctoring checklist template.
/// Neither is user content and neither is synced.
class DatabaseHelper {
  static final DatabaseHelper instance = DatabaseHelper._init();
  DatabaseHelper._init();

  /// The scope used before sign-in, and after sign-out.
  ///
  /// Not a throwaway: anything created here is real data, and the first
  /// sign-in adopts it by pushing it to that account.
  static const String localScope = 'local';

  /// The box a [base] name resolves to under [scope].
  ///
  /// The local scope deliberately keeps the **original, unsuffixed** names.
  /// That is not cosmetic: it means an install predating scoping needs no
  /// migration at all — its existing boxes simply *are* the local scope. No
  /// copying, no deleting, no half-finished move to recover from. (Copying was
  /// the first attempt, and it cannot work: Hive refuses to store one
  /// HiveObject instance in two boxes, so every record would need cloning by
  /// hand, per model.)
  static String boxName(String base, String scope) =>
      scope == localScope ? base : '${base}__$scope';

  String _scope = localScope;
  bool _open = false;

  /// The uid whose data is currently loaded, or [localScope].
  String get scope => _scope;

  late Box<ProctorSession> sessionsBox;
  late Box<ChecklistItem> checklistItemsBox;
  late Box<ChecklistTemplateItem> templateBox;
  late Box<FrequentCourse> frequentCoursesBox;

  late Box<CalendarEvent> calendarEventsBox;
  late Box<CustomCategory> customCategoriesBox;

  late Box<Habit> habitsBox;

  /// Keyed by `YYYY-MM-DD` in Jakarta — see [HabitDay].
  late Box<HabitDay> habitDaysBox;

  /// Saved conversations with the assistant, keyed by their own id.
  late Box<AiConversation> aiConversationsBox;

  /// App-wide preferences shared by every program (theme mode, QR defaults).
  late Box settingsBox;

  Future<void> init() async {
    await Hive.initFlutter();

    Hive.registerAdapter(ProctorSessionAdapter());
    Hive.registerAdapter(ChecklistItemAdapter());
    Hive.registerAdapter(ChecklistTemplateItemAdapter());
    Hive.registerAdapter(FrequentCourseAdapter());
    Hive.registerAdapter(CalendarEventAdapter());
    Hive.registerAdapter(CustomCategoryAdapter());
    Hive.registerAdapter(HabitAdapter());
    Hive.registerAdapter(HabitDayAdapter());
    Hive.registerAdapter(AiConversationAdapter());

    templateBox = await Hive.openBox<ChecklistTemplateItem>(
      'checklist_template',
    );
    settingsBox = await Hive.openBox('af_settings');

    // Auth has not resolved yet at startup, so the local scope opens first and
    // the auth listener swaps to the account's scope a beat later.
    await openScope(localScope);
  }

  /// Swaps the open boxes to [scope]'s.
  ///
  /// Every new box is opened before any field is reassigned, and the old ones
  /// close only afterwards — so there is no moment where a widget rebuilding
  /// mid-switch can read a closed box.
  Future<void> openScope(String scope) async {
    if (_open && _scope == scope) return;

    String name(String base) => boxName(base, scope);

    final sessions =
        await Hive.openBox<ProctorSession>(name('proctor_sessions'));
    final items = await Hive.openBox<ChecklistItem>(name('checklist_items'));
    final courses =
        await Hive.openBox<FrequentCourse>(name('frequent_courses'));
    final events = await Hive.openBox<CalendarEvent>(name('calendar_events'));
    final categories =
        await Hive.openBox<CustomCategory>(name('event_categories'));
    final habits = await Hive.openBox<Habit>(name('habits'));
    final habitDays = await Hive.openBox<HabitDay>(name('habit_days'));
    final conversations =
        await Hive.openBox<AiConversation>(name('ai_conversations'));

    final previous = _open
        ? <Box>[
            sessionsBox,
            checklistItemsBox,
            frequentCoursesBox,
            calendarEventsBox,
            customCategoriesBox,
            habitsBox,
            habitDaysBox,
            aiConversationsBox,
          ]
        : const <Box>[];

    sessionsBox = sessions;
    checklistItemsBox = items;
    frequentCoursesBox = courses;
    calendarEventsBox = events;
    customCategoriesBox = categories;
    habitsBox = habits;
    habitDaysBox = habitDays;
    aiConversationsBox = conversations;
    _scope = scope;
    _open = true;

    for (final box in previous) {
      await box.close();
    }
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

  // ---- Categories ----

  /// Live user-created categories, tombstones excluded.
  List<CustomCategory> getCustomCategories() {
    final categories =
        customCategoriesBox.values.where((c) => !c.deleted).toList();
    categories.sort((a, b) => a.createdAt.compareTo(b.createdAt));
    return categories;
  }

  Future<void> putCustomCategory(CustomCategory category) =>
      customCategoriesBox.put(category.id, category);

  /// Tombstones rather than removing. Events keep the slug and fall back to
  /// "Other" when it no longer resolves.
  Future<void> deleteCustomCategory(String id) async {
    final category = customCategoriesBox.get(id);
    if (category == null) return;
    category.deleted = true;
    category.updatedAt = DateTime.now();
    await category.save();
  }

  // ---- Habits ----

  /// Live habits, tombstones excluded, in display order.
  List<Habit> getHabits() {
    final habits = habitsBox.values.where((h) => !h.deleted).toList();
    habits.sort((a, b) {
      final order = a.sortOrder.compareTo(b.sortOrder);
      // Same slot after a reorder race: fall back to creation so the list is
      // never non-deterministic between two devices.
      return order != 0 ? order : a.createdAt.compareTo(b.createdAt);
    });
    return habits;
  }

  Future<void> putHabit(Habit habit) => habitsBox.put(habit.id, habit);

  /// Tombstones the habit. Its marks are left in place on each [HabitDay] —
  /// see the note there on why they are filtered rather than swept.
  Future<void> deleteHabit(String id) async {
    final habit = habitsBox.get(id);
    if (habit == null || habit.deleted) return;
    habit
      ..deleted = true
      ..updatedAt = DateTime.now();
    await habit.save();
  }

  /// The marks for one Jakarta day, or null if nothing was ever ticked on it.
  HabitDay? getHabitDay(String day) => habitDaysBox.get(day);

  List<HabitDay> getHabitDays() => habitDaysBox.values.toList();

  Future<void> putHabitDay(HabitDay day) => habitDaysBox.put(day.day, day);

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

  /// Sessions with the given status, tombstones excluded, earliest first.
  List<ProctorSession> getSessions(String status) {
    final sessions = sessionsBox.values
        .where((s) => s.status == status && !s.deleted)
        .toList();
    sessions.sort((a, b) => a.dateTime.compareTo(b.dateTime));
    return sessions;
  }

  /// Null for a deleted session, so a stale `/checklists/3` URL or a deletion
  /// arriving from another device lands on the "no longer exists" state
  /// instead of opening a ghost record.
  ProctorSession? getSessionByKey(dynamic key) {
    final session = sessionsBox.get(key);
    return session == null || session.deleted ? null : session;
  }

  Future<void> updateSessionStatus(dynamic key, String status) async {
    final session = sessionsBox.get(key);
    if (session != null) {
      session.status = status;
      await session.save();
    }
  }

  /// Tombstones a session and every checklist item hanging off it.
  ///
  /// The rows stay: a record removed outright looks to the other device like a
  /// document it is simply missing, and gets recreated on the next sync. The
  /// items go too, or they outlive their parent in Firestore with nothing left
  /// to relink them to.
  Future<void> deleteSession(dynamic key) async {
    final session = sessionsBox.get(key);
    if (session == null || session.deleted) return;

    // One timestamp for the whole cascade, so the session and its items cannot
    // land on opposite sides of a concurrent edit elsewhere.
    final now = DateTime.now();

    session
      ..deleted = true
      ..updatedAt = now;
    await session.save();

    for (final item in checklistItemsBox.values) {
      if (item.sessionKey != key.toString() || item.deleted) continue;
      item
        ..deleted = true
        ..updatedAt = now;
      await item.save();
    }
  }

  // ---- Checklist items ----
  Future<void> insertChecklistItem(ChecklistItem item) async {
    await checklistItemsBox.add(item);
  }

  /// A session's items, tombstones excluded, in template order.
  List<ChecklistItem> getChecklistItems(String sessionKey) {
    final items = checklistItemsBox.values
        .where((i) => i.sessionKey == sessionKey && !i.deleted)
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

  // ---- AI conversations ----

  /// Live conversations, tombstones excluded, most recently used first.
  List<AiConversation> getAiConversations() {
    final conversations =
        aiConversationsBox.values.where((c) => !c.deleted).toList();
    conversations.sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
    return conversations;
  }

  AiConversation? getAiConversation(String id) => aiConversationsBox.get(id);

  Future<void> putAiConversation(AiConversation conversation) =>
      aiConversationsBox.put(conversation.id, conversation);

  /// Tombstones the conversation, so deleting it on one device does not have
  /// it pushed back by the next device to sync.
  Future<void> deleteAiConversation(String id) async {
    final conversation = aiConversationsBox.get(id);
    if (conversation == null || conversation.deleted) return;
    conversation
      ..deleted = true
      ..turns = const []
      ..updatedAt = DateTime.now();
    await conversation.save();
  }
}
