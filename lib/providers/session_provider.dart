import 'package:af/models/proctor_session..dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../db/database_helper.dart';
import '../models/checklist_item.dart';
import 'template_provider.dart';

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

  // upcoming = active sessions strictly after today
  return active
      .where(
        (s) =>
            s.dateTime.isAfter(todayEnd) ||
            s.dateTime.isAtSameMomentAs(todayEnd),
      )
      .toList();
});

final sessionChecklistProvider =
    FutureProvider.family<List<ChecklistItem>, int>((ref, sessionId) async {
      return DatabaseHelper.instance.getChecklistItems(sessionId);
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

    final sessionId = await db.insertSession(session);

    final template = await db.getTemplate();
    for (final t in template) {
      await db.insertChecklistItem(
        ChecklistItem(
          sessionId: sessionId,
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

  Future<bool> toggleChecklistItem(ChecklistItem item, int sessionId) async {
    final db = DatabaseHelper.instance;
    final updated = item.copyWith(isChecked: !item.isChecked);
    await db.updateChecklistItem(updated);

    final allItems = await db.getChecklistItems(sessionId);
    final allChecked = allItems.every((i) => i.isChecked);

    if (allChecked) {
      await db.updateSessionStatus(sessionId, 'archived');
      ref.invalidate(activeSessionsProvider);
      ref.invalidate(archivedSessionsProvider);
    }

    ref.invalidate(sessionChecklistProvider(sessionId));
    return allChecked;
  }
}

final sessionControllerProvider = Provider((ref) => SessionController(ref));
