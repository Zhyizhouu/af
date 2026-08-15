import 'package:hive/hive.dart';

part 'ai_conversation.g.dart';

/// One saved conversation with the assistant.
///
/// Sync-shaped like [Habit] and [CalendarEvent]: [id] is a UUID that doubles as
/// the Hive key and the Firestore document id, [updatedAt] gives
/// last-write-wins something to compare, and [deleted] is a tombstone.
///
/// The whole conversation is one record rather than one per message, for the
/// same reason a habit's day is one record rather than one per habit: it is
/// always written as a whole, it is small, and the conversation is the right
/// unit for last-write-wins. Two devices editing the same chat at once would
/// be odd; two devices each adding a message to it and one winning is not.
///
/// This is also the only place a transcript is kept. The assistant's API holds
/// nothing between calls, so history existing at all is this record — which is
/// why it syncs through AF's own Firestore subtree rather than through the
/// converter's backend.
@HiveType(typeId: 8)
class AiConversation extends HiveObject {
  @HiveField(0)
  final String id;

  /// Taken from the first thing asked, so the list reads as what you wanted
  /// rather than as a row of timestamps.
  @HiveField(1)
  String title;

  /// The messages, one JSON object per entry, oldest first.
  ///
  /// Stored encoded rather than as a nested Hive type: a message holds
  /// proposals, which hold sessions and events, and modelling that as four
  /// more adapters would buy nothing — the shape is already defined by what
  /// goes over the wire, and one representation cannot drift from the other.
  @HiveField(2)
  List<String> turns;

  @HiveField(3)
  final DateTime createdAt;

  @HiveField(4)
  DateTime updatedAt;

  @HiveField(5)
  bool deleted;

  AiConversation({
    required this.id,
    required this.title,
    required this.turns,
    required this.createdAt,
    required this.updatedAt,
    this.deleted = false,
  });

  /// A Firestore document has a hard 1 MiB ceiling and a conversation only
  /// grows. Trimming the oldest is what every chat does when it runs long, and
  /// it keeps the end — the part anybody scrolls back to — intact.
  static const maxTurns = 200;
}
