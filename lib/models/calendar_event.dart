import 'package:hive/hive.dart';

part 'calendar_event.g.dart';

/// An event owned by the Calendar program.
///
/// Unlike the older models, this one is shaped for sync from the start:
/// [id] is a UUID rather than a Hive auto-key so the same record can exist on
/// two devices, [updatedAt] gives last-write-wins a field to compare, and
/// [deleted] is a tombstone — a row removed outright on one device could not
/// be propagated as a deletion to another.
@HiveType(typeId: 4)
class CalendarEvent extends HiveObject {
  @HiveField(0)
  final String id;

  @HiveField(1)
  String title;

  @HiveField(2)
  String notes;

  @HiveField(3)
  DateTime start;

  @HiveField(4)
  DateTime end;

  @HiveField(5)
  bool allDay;

  /// Index into the Calendar's palette, not a raw colour — so the same event
  /// stays legible when the theme flips between light and dark.
  @HiveField(6)
  int colorIndex;

  @HiveField(7)
  final DateTime createdAt;

  @HiveField(8)
  DateTime updatedAt;

  @HiveField(9)
  bool deleted;

  CalendarEvent({
    required this.id,
    required this.title,
    this.notes = '',
    required this.start,
    required this.end,
    this.allDay = false,
    this.colorIndex = 0,
    required this.createdAt,
    required this.updatedAt,
    this.deleted = false,
  });

  /// The calendar days this event touches, normalised to midnight.
  Iterable<DateTime> get spannedDays sync* {
    var day = DateTime(start.year, start.month, start.day);
    final last = DateTime(end.year, end.month, end.day);
    while (!day.isAfter(last)) {
      yield day;
      day = day.add(const Duration(days: 1));
    }
  }

  bool get isMultiDay =>
      start.year != end.year ||
      start.month != end.month ||
      start.day != end.day;
}
