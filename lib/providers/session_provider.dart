import '../models/proctor_session.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';
import '../db/database_helper.dart';
import '../db/session_maintenance.dart';
import '../models/checklist_item.dart';
import '../sync/sync_controller.dart';

const _uuid = Uuid();

enum SessionFilter { upcoming, today, archived }

final activeSessionsProvider = FutureProvider<List<ProctorSession>>((
  ref,
) async {
  await archiveStaleSessions();
  return DatabaseHelper.instance.getSessions('active');
});

final archivedSessionsProvider = FutureProvider<List<ProctorSession>>((
  ref,
) async {
  await archiveStaleSessions();
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

/// Looks a session up by its Hive key, for deep links like
/// `/checklists/3` — on web a refresh has only the URL to work from.
final sessionByKeyProvider =
    Provider.family<ProctorSession?, String>((ref, key) {
  return DatabaseHelper.instance.getSessionByKey(int.tryParse(key) ?? key);
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

    final now = DateTime.now();
    final session = ProctorSession(
      type: type,
      dateTime: dateTime,
      room: room,
      courseCode: courseCode,
      courseName: courseName,
      courseClass: courseClass,
      status: 'active',
      createdAt: now,
      syncId: _uuid.v4(),
      updatedAt: now,
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
          syncId: _uuid.v4(),
          sessionId: session.syncId,
          updatedAt: now,
        ),
      );
    }

    if (courseCode.isNotEmpty) {
      await db.insertFrequentCourse(courseCode, courseName, courseClass);
    }

    ref.invalidate(activeSessionsProvider);
    ref.read(syncControllerProvider.notifier).requestSync();
  }

  /// Flips one item. Returns whether every item is now checked.
  ///
  /// Ticking the last item no longer archives the session: filing is either
  /// time-based ([archiveStaleSessions]) or explicit ([setFinished]). Having
  /// a checkbox navigate the user out of the screen was the worse behaviour.
  Future<bool> toggleChecklistItem(
    ChecklistItem item,
    String sessionKey,
  ) async {
    final db = DatabaseHelper.instance;
    item.isChecked = !item.isChecked;
    item.updatedAt = DateTime.now();
    await db.updateChecklistItem(item);

    final allItems = db.getChecklistItems(sessionKey);
    final allChecked = allItems.every((i) => i.isChecked);

    ref.invalidate(sessionChecklistProvider(sessionKey));
    ref.read(syncControllerProvider.notifier).requestSync();
    return allChecked;
  }

  /// Explicitly finish or reopen a session.
  ///
  /// Finished sessions carry `status == 'archived'`, which is what keeps them
  /// out of Today and Upcoming — both read [activeSessionsProvider], and that
  /// only returns active rows.
  Future<void> setFinished(String sessionKey, bool finished) async {
    final db = DatabaseHelper.instance;
    final session = db.getSessionByKey(_keyFromString(sessionKey));
    if (session == null) return;

    session.status = finished ? 'archived' : 'active';
    // Reopening is a deliberate override of the stale sweep; finishing by
    // hand clears the exemption again.
    session.reopened = !finished;
    session.updatedAt = DateTime.now();
    await session.save();

    ref
      ..invalidate(activeSessionsProvider)
      ..invalidate(archivedSessionsProvider);
    ref.read(syncControllerProvider.notifier).requestSync();
  }

  /// Deletes a session and its checklist items.
  ///
  /// A tombstone rather than a removal, so the deletion reaches the user's
  /// other devices — see [DatabaseHelper.deleteSession].
  Future<void> delete(String sessionKey) async {
    await DatabaseHelper.instance.deleteSession(_keyFromString(sessionKey));

    ref
      ..invalidate(activeSessionsProvider)
      ..invalidate(archivedSessionsProvider)
      ..invalidate(sessionChecklistProvider(sessionKey));
    ref.read(syncControllerProvider.notifier).requestSync();
  }

  dynamic _keyFromString(String key) {
    return int.tryParse(key) ?? key;
  }
}

final sessionControllerProvider = Provider((ref) => SessionController(ref));
