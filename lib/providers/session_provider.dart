import '../models/proctor_session.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../db/database_helper.dart';
import '../models/checklist_item.dart';

enum SessionFilter { upcoming, today, archived }

final activeSessionsProvider = FutureProvider<List<ProctorSession>>((
  ref,
) async {
  return DatabaseHelper.instance.getSessions('active');
});

final archivedSessionsProvider = FutureProvider<List<ProctorSession>>((
  ref,
) async {
  return DatabaseHelper.instance.getSessions('archived');
});

final sessionFilterProvider = StateProvider<SessionFilter>(
  (ref) => SessionFilter.today,
);

final filteredSessionsProvider = FutureProvider<List<ProctorSession>>((
  ref,
) async {
  final filter = ref.watch(sessionFilterProvider);

  if (filter == SessionFilter.archived) {
    return ref.watch(archivedSessionsProvider.future);
  }

  final active = await ref.watch(activeSessionsProvider.future);
  final now = DateTime.now();
  final todayStart = DateTime(now.year, now.month, now.day);
  final todayEnd = todayStart.add(const Duration(days: 1));

  if (filter == SessionFilter.today) {
    return active
        .where(
          (s) =>
              s.dateTime.isAfter(
                todayStart.subtract(const Duration(seconds: 1)),
              ) &&
              s.dateTime.isBefore(todayEnd),
        )
        .toList();
  }

  return active.where((s) => !s.dateTime.isBefore(todayEnd)).toList();
});

final sessionChecklistProvider =
    FutureProvider.family<List<ChecklistItem>, String>((ref, sessionKey) async {
      return DatabaseHelper.instance.getChecklistItems(sessionKey);
    });

class SessionController {
  final Ref ref;
  SessionController(this.ref);

  Future<void> createSession({
    required String type,
    required DateTime dateTime,
    required String room,
    required String courseCode,
    required String courseName,
    required String courseClass,
  }) async {
    final db = DatabaseHelper.instance;

    final session = ProctorSession(
      type: type,
      dateTime: dateTime,
      room: room,
      courseCode: courseCode,
      courseName: courseName,
      courseClass: courseClass,
      status: 'active',
      createdAt: DateTime.now(),
    );

    final sessionKey = await db.insertSession(session);

    final template = db.getTemplate(type: type);
    for (final t in template) {
      await db.insertChecklistItem(
        ChecklistItem(
          sessionKey: sessionKey,
          label: t.label,
          section: t.section,
          isChecked: false,
          sortOrder: t.sortOrder,
        ),
      );
    }

    if (courseCode.isNotEmpty) {
      await db.insertFrequentCourse(courseCode, courseName, courseClass);
    }

    ref.invalidate(activeSessionsProvider);
  }

  Future<bool> toggleChecklistItem(
    ChecklistItem item,
    String sessionKey,
  ) async {
    final db = DatabaseHelper.instance;
    item.isChecked = !item.isChecked;
    await db.updateChecklistItem(item);

    final allItems = db.getChecklistItems(sessionKey);
    final allChecked = allItems.every((i) => i.isChecked);

    if (allChecked) {
      final session = db.getSessionByKey(_keyFromString(sessionKey));
      if (session != null) {
        session.status = 'archived';
        await session.save();
      }
      ref.invalidate(activeSessionsProvider);
      ref.invalidate(archivedSessionsProvider);
    }

    ref.invalidate(sessionChecklistProvider(sessionKey));
    return allChecked;
  }

  dynamic _keyFromString(String key) {
    return int.tryParse(key) ?? key;
  }
}

final sessionControllerProvider = Provider((ref) => SessionController(ref));
