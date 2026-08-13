import 'package:cloud_firestore/cloud_firestore.dart';

import '../db/database_helper.dart';
import '../models/calendar_event.dart';
import '../models/checklist_item.dart';
import '../models/custom_category.dart';
import '../models/proctor_session.dart';

/// Two-way sync between the local Hive boxes and Firestore.
///
/// Reconciliation is last-write-wins on `updatedAt`, with tombstones so a
/// deletion on one device propagates instead of being resurrected by the
/// other. Everything lives under `users/{uid}`, which is also the unit the
/// security rules lock down.
///
/// Hive keys are never used as document ids — they are per-device
/// auto-increment integers. Documents are keyed by each record's `syncId`.
class SyncService {
  final FirebaseFirestore _firestore;

  SyncService({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

  static const _sessions = 'sessions';
  static const _items = 'checklistItems';
  static const _events = 'events';
  static const _categories = 'categories';

  CollectionReference<Map<String, dynamic>> _collection(
    String uid,
    String name,
  ) =>
      _firestore.collection('users').doc(uid).collection(name);

  /// Reconciles everything. Sessions go first so checklist items can resolve
  /// their parent's local Hive key.
  Future<void> syncAll(String uid) async {
    await _syncSessions(uid);
    await _syncChecklistItems(uid);
    // Categories before events: an event's colour resolves through its
    // category, so pulling events first would show them all as "Other".
    await _syncCategories(uid);
    await _syncEvents(uid);
  }

  // ---- sessions ----

  Future<void> _syncSessions(String uid) async {
    final db = DatabaseHelper.instance;
    final collection = _collection(uid, _sessions);
    final remote = await collection.get();

    final remoteDocs = {for (final doc in remote.docs) doc.id: doc.data()};
    final batch = _firestore.batch();

    for (final session in db.sessionsBox.values) {
      if (session.syncId.isEmpty) continue;
      final data = remoteDocs[session.syncId];
      if (data == null || _localWins(session.updatedAt, data)) {
        batch.set(collection.doc(session.syncId), _sessionToMap(session));
      }
    }

    final localBySyncId = {
      for (final session in db.sessionsBox.values) session.syncId: session,
    };

    for (final entry in remoteDocs.entries) {
      final local = localBySyncId[entry.key];
      final data = entry.value;

      if (local == null) {
        if (data['deleted'] == true) continue;
        await db.sessionsBox.add(_sessionFromMap(entry.key, data));
      } else if (!_localWins(local.updatedAt, data)) {
        // Most session fields are final, so replace the record in place
        // rather than mutating it.
        await db.sessionsBox.put(local.key, _sessionFromMap(entry.key, data));
      }
    }

    await batch.commit();
  }

  Map<String, dynamic> _sessionToMap(ProctorSession s) => {
        'type': s.type,
        'dateTime': Timestamp.fromDate(s.dateTime),
        'room': s.room,
        'courseCode': s.courseCode,
        'courseName': s.courseName,
        'courseClass': s.courseClass,
        'status': s.status,
        'createdAt': Timestamp.fromDate(s.createdAt),
        'updatedAt': Timestamp.fromDate(s.updatedAt ?? s.createdAt),
        'deleted': s.deleted,
        'reopened': s.reopened,
      };

  ProctorSession _sessionFromMap(String syncId, Map<String, dynamic> data) =>
      ProctorSession(
        type: data['type'] as String? ?? 'UAP',
        dateTime: _date(data['dateTime']),
        room: data['room'] as String? ?? '',
        courseCode: data['courseCode'] as String? ?? '',
        courseName: data['courseName'] as String? ?? '',
        courseClass: data['courseClass'] as String? ?? '',
        status: data['status'] as String? ?? 'active',
        createdAt: _date(data['createdAt']),
        syncId: syncId,
        updatedAt: _date(data['updatedAt']),
        deleted: data['deleted'] as bool? ?? false,
        reopened: data['reopened'] as bool? ?? false,
      );

  // ---- checklist items ----

  Future<void> _syncChecklistItems(String uid) async {
    final db = DatabaseHelper.instance;
    final collection = _collection(uid, _items);
    final remote = await collection.get();

    final remoteDocs = {for (final doc in remote.docs) doc.id: doc.data()};
    final batch = _firestore.batch();

    for (final item in db.checklistItemsBox.values) {
      if (item.syncId.isEmpty) continue;
      final data = remoteDocs[item.syncId];
      if (data == null || _localWins(item.updatedAt, data)) {
        batch.set(collection.doc(item.syncId), _itemToMap(item));
      }
    }

    // Parent lookup: a session's Hive key differs per device, so incoming
    // items are relinked through the parent's syncId.
    final sessionKeyBySyncId = {
      for (final session in db.sessionsBox.values)
        session.syncId: session.key.toString(),
    };
    final localBySyncId = {
      for (final item in db.checklistItemsBox.values) item.syncId: item,
    };

    for (final entry in remoteDocs.entries) {
      final data = entry.value;
      final local = localBySyncId[entry.key];

      if (local == null) {
        if (data['deleted'] == true) continue;
        final sessionId = data['sessionId'] as String? ?? '';
        final sessionKey = sessionKeyBySyncId[sessionId];
        // Orphan: its session was deleted, or has not arrived yet. Skip it —
        // the next sync will pick it up once the parent exists.
        if (sessionKey == null) continue;
        await db.checklistItemsBox.add(
          _itemFromMap(entry.key, data, sessionKey),
        );
      } else if (!_localWins(local.updatedAt, data)) {
        local
          ..isChecked = data['isChecked'] as bool? ?? false
          ..updatedAt = _date(data['updatedAt'])
          ..deleted = data['deleted'] as bool? ?? false;
        await local.save();
      }
    }

    await batch.commit();
  }

  Map<String, dynamic> _itemToMap(ChecklistItem item) => {
        'sessionId': item.sessionId,
        'label': item.label,
        'section': item.section,
        'isChecked': item.isChecked,
        'sortOrder': item.sortOrder,
        'updatedAt': Timestamp.fromDate(
          item.updatedAt ?? DateTime.fromMillisecondsSinceEpoch(0),
        ),
        'deleted': item.deleted,
      };

  ChecklistItem _itemFromMap(
    String syncId,
    Map<String, dynamic> data,
    String sessionKey,
  ) =>
      ChecklistItem(
        sessionKey: sessionKey,
        label: data['label'] as String? ?? '',
        section: data['section'] as String? ?? '',
        isChecked: data['isChecked'] as bool? ?? false,
        sortOrder: (data['sortOrder'] as num?)?.toInt() ?? 0,
        syncId: syncId,
        sessionId: data['sessionId'] as String? ?? '',
        updatedAt: _date(data['updatedAt']),
        deleted: data['deleted'] as bool? ?? false,
      );

  // ---- calendar events ----

  Future<void> _syncEvents(String uid) async {
    final db = DatabaseHelper.instance;
    final collection = _collection(uid, _events);
    final remote = await collection.get();

    final remoteDocs = {for (final doc in remote.docs) doc.id: doc.data()};
    final batch = _firestore.batch();

    for (final event in db.calendarEventsBox.values) {
      final data = remoteDocs[event.id];
      if (data == null || _localWins(event.updatedAt, data)) {
        batch.set(collection.doc(event.id), _eventToMap(event));
      }
    }

    for (final entry in remoteDocs.entries) {
      final local = db.calendarEventsBox.get(entry.key);
      final data = entry.value;

      if (local == null || !_localWins(local.updatedAt, data)) {
        // The events box is already keyed by the sync id, so put() covers
        // both insert and update.
        await db.calendarEventsBox.put(
          entry.key,
          _eventFromMap(entry.key, data),
        );
      }
    }

    await batch.commit();
  }

  Map<String, dynamic> _eventToMap(CalendarEvent e) => {
        'title': e.title,
        'notes': e.notes,
        'start': Timestamp.fromDate(e.start),
        'end': Timestamp.fromDate(e.end),
        'allDay': e.allDay,
        'category': e.category,
        'createdAt': Timestamp.fromDate(e.createdAt),
        'updatedAt': Timestamp.fromDate(e.updatedAt),
        'deleted': e.deleted,
      };

  CalendarEvent _eventFromMap(String id, Map<String, dynamic> data) =>
      CalendarEvent(
        id: id,
        title: data['title'] as String? ?? '',
        notes: data['notes'] as String? ?? '',
        start: _date(data['start']),
        end: _date(data['end']),
        allDay: data['allDay'] as bool? ?? false,
        category: data['category'] as String? ?? 'other',
        createdAt: _date(data['createdAt']),
        updatedAt: _date(data['updatedAt']),
        deleted: data['deleted'] as bool? ?? false,
      );

  // ---- custom categories ----

  Future<void> _syncCategories(String uid) async {
    final db = DatabaseHelper.instance;
    final collection = _collection(uid, _categories);
    final remote = await collection.get();

    final remoteDocs = {for (final doc in remote.docs) doc.id: doc.data()};
    final batch = _firestore.batch();

    for (final category in db.customCategoriesBox.values) {
      final data = remoteDocs[category.id];
      if (data == null || _localWins(category.updatedAt, data)) {
        batch.set(collection.doc(category.id), {
          'label': category.label,
          'toneIndex': category.toneIndex,
          'createdAt': Timestamp.fromDate(category.createdAt),
          'updatedAt': Timestamp.fromDate(category.updatedAt),
          'deleted': category.deleted,
        });
      }
    }

    for (final entry in remoteDocs.entries) {
      final local = db.customCategoriesBox.get(entry.key);
      final data = entry.value;

      if (local == null || !_localWins(local.updatedAt, data)) {
        // Box is keyed by the sync id, so put() both inserts and updates.
        await db.customCategoriesBox.put(
          entry.key,
          CustomCategory(
            id: entry.key,
            label: data['label'] as String? ?? 'Untitled',
            toneIndex: (data['toneIndex'] as num?)?.toInt() ?? 0,
            createdAt: _date(data['createdAt']),
            updatedAt: _date(data['updatedAt']),
            deleted: data['deleted'] as bool? ?? false,
          ),
        );
      }
    }

    await batch.commit();
  }

  // ---- helpers ----

  /// True when the local copy is strictly newer than the remote one.
  ///
  /// Ties go to the remote so that two devices converge instead of pushing the
  /// same record back and forth.
  bool _localWins(DateTime? localUpdatedAt, Map<String, dynamic> remote) {
    final local = localUpdatedAt ?? DateTime.fromMillisecondsSinceEpoch(0);
    return local.isAfter(_date(remote['updatedAt']));
  }

  static DateTime _date(Object? value) => switch (value) {
        Timestamp timestamp => timestamp.toDate(),
        DateTime dateTime => dateTime,
        int millis => DateTime.fromMillisecondsSinceEpoch(millis),
        _ => DateTime.fromMillisecondsSinceEpoch(0),
      };
}
