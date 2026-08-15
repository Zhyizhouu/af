import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../db/database_helper.dart';
import '../../models/ai_conversation.dart';
import '../../sync/sync_controller.dart';
import 'ai_message.dart';

const _uuid = Uuid();

/// Saved conversations, most recently used first, tombstones excluded.
final aiConversationsProvider =
    FutureProvider<List<AiConversation>>((ref) async {
  return DatabaseHelper.instance.getAiConversations();
});

/// Reads and writes the assistant's history.
///
/// The store is deliberately thin: a conversation is written whole every time
/// it changes, because it is small and because the whole thing is the unit
/// last-write-wins compares. Anything cleverer would be a merge strategy for a
/// problem nobody has — two devices writing the same chat in the same breath.
class AiConversationController {
  final Ref ref;

  AiConversationController(this.ref);

  /// Writes [messages] as conversation [id], creating it if it is new.
  ///
  /// Returns the record, so a caller that has just started a conversation can
  /// keep hold of what it now is.
  Future<AiConversation> save({
    required String id,
    required List<AiMessage> messages,
  }) async {
    final db = DatabaseHelper.instance;
    final now = DateTime.now();
    final existing = db.getAiConversation(id);

    // The tail rather than the head: a conversation that outgrows the cap is
    // one somebody has been using, and the recent end is the part they scroll
    // back to.
    final kept = messages.length > AiConversation.maxTurns
        ? messages.sublist(messages.length - AiConversation.maxTurns)
        : messages;

    final conversation = AiConversation(
      id: id,
      title: existing?.title.isNotEmpty == true
          ? existing!.title
          : titleFor(messages),
      turns: [for (final message in kept) jsonEncode(message.toJson())],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    );

    await db.putAiConversation(conversation);
    ref.invalidate(aiConversationsProvider);
    ref.read(syncControllerProvider.notifier).requestSync();
    return conversation;
  }

  Future<void> delete(String id) async {
    await DatabaseHelper.instance.deleteAiConversation(id);
    ref.invalidate(aiConversationsProvider);
    ref.read(syncControllerProvider.notifier).requestSync();
  }

  /// Reads a conversation back into messages.
  ///
  /// A turn that will not parse is skipped rather than throwing: this data has
  /// been through Hive and Firestore and may have been written by an older
  /// build, and one unreadable turn should cost one turn, not the whole
  /// conversation.
  List<AiMessage> load(AiConversation conversation) {
    final messages = <AiMessage>[];
    for (final turn in conversation.turns) {
      try {
        final decoded = jsonDecode(turn);
        if (decoded is! Map<String, dynamic>) continue;
        final message = AiMessage.fromJson(decoded);
        if (message != null) messages.add(message);
      } on FormatException {
        continue;
      }
    }
    return messages;
  }

  /// A name for the list, taken from the first thing asked.
  static String titleFor(List<AiMessage> messages) {
    for (final message in messages) {
      if (!message.isUser) continue;
      final text = message.text.trim().replaceAll(RegExp(r'\s+'), ' ');
      if (text.isEmpty) continue;
      return text.length <= 60 ? text : '${text.substring(0, 57)}…';
    }
    return 'New conversation';
  }

  static String newId() => _uuid.v4();
}

final aiConversationControllerProvider =
    Provider((ref) => AiConversationController(ref));
