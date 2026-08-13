import 'package:uuid/uuid.dart';

import '../programs/calendar/event_category.dart';
import 'database_helper.dart';

const _uuid = Uuid();

/// Backfills sync identity onto records written before sync existed.
///
/// Runs at every startup and is idempotent — it only touches records whose
/// fields are still empty, so it costs nothing once everything is migrated.
/// Nothing is deleted or re-keyed: Hive keys stay exactly as they were, and
/// [ProctorSession.syncId] is added alongside them.
Future<void> runSyncMigration() async {
  final db = DatabaseHelper.instance;

  // Local Hive key -> stable sync id, so items can be relinked below.
  final sessionSyncIds = <String, String>{};

  for (final session in db.sessionsBox.values) {
    var dirty = false;

    if (session.syncId.isEmpty) {
      session.syncId = _uuid.v4();
      dirty = true;
    }
    if (session.updatedAt == null) {
      session.updatedAt = session.createdAt;
      dirty = true;
    }
    if (dirty) await session.save();

    sessionSyncIds[session.key.toString()] = session.syncId;
  }

  for (final item in db.checklistItemsBox.values) {
    var dirty = false;

    if (item.syncId.isEmpty) {
      item.syncId = _uuid.v4();
      dirty = true;
    }
    if (item.sessionId.isEmpty) {
      final parent = sessionSyncIds[item.sessionKey];
      if (parent != null) {
        item.sessionId = parent;
        dirty = true;
      }
    }
    if (item.updatedAt == null) {
      // No creation timestamp on items; anchor to the epoch so any genuine
      // edit on another device wins the last-write-wins comparison.
      item.updatedAt = DateTime.fromMillisecondsSinceEpoch(0);
      dirty = true;
    }
    if (dirty) await item.save();
  }

  // Events predating classification carry a free-choice palette index; map it
  // onto the nearest built-in so they keep a sensible colour.
  for (final event in db.calendarEventsBox.values) {
    if (event.category.isNotEmpty) continue;
    event.category = legacyColorIndexToSlug(event.colorIndex);
    await event.save();
  }
}
