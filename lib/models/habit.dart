import 'package:hive/hive.dart';

part 'habit.g.dart';

/// One thing you are trying to do every day.
///
/// Sync-shaped like [CalendarEvent]: [id] is a UUID that doubles as the Hive
/// key and the Firestore document id, [updatedAt] gives last-write-wins
/// something to compare, and [deleted] is a tombstone.
@HiveType(typeId: 6)
class Habit extends HiveObject {
  @HiveField(0)
  final String id;

  @HiveField(1)
  String name;

  /// Index into the shared category tones, so a habit's colour comes from the
  /// same palette the calendar uses rather than a second set of colours.
  @HiveField(2)
  int toneIndex;

  @HiveField(3)
  int sortOrder;

  @HiveField(4)
  final DateTime createdAt;

  @HiveField(5)
  DateTime updatedAt;

  @HiveField(6)
  bool deleted;

  Habit({
    required this.id,
    required this.name,
    this.toneIndex = 0,
    this.sortOrder = 0,
    required this.createdAt,
    required this.updatedAt,
    this.deleted = false,
  });
}
