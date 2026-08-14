import 'package:hive/hive.dart';

part 'habit_day.g.dart';

/// One day's marks — **not** one habit's mark on one day.
///
/// This is the shape that keeps the tracker cheap. The obvious model, a record
/// per habit per day, costs `habits × days`: five habits over a year is 1,825
/// Hive rows and 1,825 Firestore documents, growing without bound. Holding the
/// completed ids as a set on the day instead costs one record per day at most —
/// 365 a year however many habits you keep — and only for days you actually
/// ticked something, since a day with no marks is never written.
///
/// The day is also the right unit for last-write-wins. Coarser (a record per
/// month) and two devices ticking different days in the same month would lose a
/// month of marks to the conflict; finer buys nothing.
///
/// There is no tombstone because day records are never deleted. Unticking the
/// last habit leaves an empty [completed], which is a legitimate state meaning
/// "asked and answered: nothing done" — and it sidesteps the whole
/// delete-versus-resurrect problem for the highest-volume collection in the app.
@HiveType(typeId: 7)
class HabitDay extends HiveObject {
  /// `YYYY-MM-DD` in Jakarta. Also the Hive key and the Firestore document id.
  @HiveField(0)
  final String day;

  /// The [Habit.id]s ticked on this day.
  ///
  /// Ids of deleted habits are simply left here rather than swept out — reads
  /// join against the live habit list, so a stale id costs a few bytes and
  /// disappears from every view on its own. Pruning would mean rewriting every
  /// day record each time a habit is deleted.
  @HiveField(1)
  List<String> completed;

  @HiveField(2)
  DateTime updatedAt;

  HabitDay({
    required this.day,
    required this.completed,
    required this.updatedAt,
  });
}
