import 'package:hive/hive.dart';

part 'proctor_session.g.dart';

@HiveType(typeId: 0)
class ProctorSession extends HiveObject {
  @HiveField(0)
  final String type;

  @HiveField(1)
  final DateTime dateTime;

  @HiveField(2)
  final String room;

  @HiveField(3)
  final String courseCode;

  @HiveField(4)
  final String courseName;

  @HiveField(5)
  final String courseClass;

  @HiveField(6)
  String status;

  @HiveField(7)
  final DateTime createdAt;

  /// Stable cross-device identity, distinct from the Hive key.
  ///
  /// Hive keys are per-device auto-increment integers, so device A's session 0
  /// and device B's session 0 are unrelated records — they cannot be used as
  /// sync identities. Records written before sync existed default to empty and
  /// are filled in by `runSyncMigration`.
  @HiveField(8, defaultValue: '')
  String syncId;

  /// Last local mutation, for last-write-wins reconciliation.
  @HiveField(9)
  DateTime? updatedAt;

  /// Tombstone. A row deleted outright could not propagate as a deletion.
  @HiveField(10, defaultValue: false)
  bool deleted;

  /// Set when someone reopens a finished session by hand.
  ///
  /// Exempts it from the stale sweep. Without this, reopening is futile: any
  /// session worth reopening is by definition already past the cutoff, so the
  /// next sweep would archive it straight back.
  @HiveField(11, defaultValue: false)
  bool reopened;

  ProctorSession({
    required this.type,
    required this.dateTime,
    required this.room,
    required this.courseCode,
    required this.courseName,
    required this.courseClass,
    this.status = 'active',
    required this.createdAt,
    this.syncId = '',
    this.updatedAt,
    this.deleted = false,
    this.reopened = false,
  });
}
