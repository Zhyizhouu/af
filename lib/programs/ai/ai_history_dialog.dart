import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../models/ai_conversation.dart';
import '../../theme/af_text.dart';
import '../../theme/af_tokens.dart';
import '../../widgets/af_button.dart';
import '../../widgets/af_scaffold.dart';
import 'ai_conversation_store.dart';

final DateFormat _stamp = DateFormat('d MMM · HH:mm');

/// Past conversations, newest first.
///
/// Everything in here is synced, so this list is the same on every device
/// signed into the account — which is the whole point of it existing. A
/// conversation opened here is the transcript, not a summary of it: the
/// proposals it made are still on their cards, and the ones already carried
/// out still say so.
class AiHistoryDialog extends ConsumerWidget {
  /// The conversation currently on screen, marked so it is obvious which row
  /// is the one you are already in.
  final String? currentId;

  const AiHistoryDialog({super.key, this.currentId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final conversations = ref.watch(aiConversationsProvider);

    return AlertDialog(
      title: const Text('HISTORY'),
      content: SizedBox(
        width: 380,
        child: conversations.when(
          // Min rather than fixed heights: the empty state is two lines of
          // prose, and a box sized to look right on a desktop clips it on a
          // phone.
          loading: () => const _Placeholder(
            child: AFEmptyState(glyph: '', message: 'Loading…'),
          ),
          error: (error, _) => _Placeholder(
            child: Text(
              'History could not be read: $error',
              textAlign: TextAlign.center,
              style: AFText.mono(size: 12, color: context.af.warn, height: 1.6),
            ),
          ),
          data: (list) => list.isEmpty
              ? const _Placeholder(
                  child: AFEmptyState(
                    glyph: '✦',
                    message: 'Nothing saved yet.\n'
                        'Conversations appear here as you have them.',
                  ),
                )
              : ConstrainedBox(
                  constraints: const BoxConstraints(maxHeight: 380),
                  child: ListView.builder(
                    shrinkWrap: true,
                    itemCount: list.length,
                    itemBuilder: (context, index) => _Row(
                      conversation: list[index],
                      current: list[index].id == currentId,
                      onOpen: () =>
                          Navigator.of(context).pop(list[index]),
                      onDelete: () => ref
                          .read(aiConversationControllerProvider)
                          .delete(list[index].id),
                    ),
                  ),
                ),
        ),
      ),
      actions: [
        AFButton.quiet(
          label: 'Close',
          onPressed: () => Navigator.of(context).pop(),
        ),
      ],
    );
  }
}

/// Holds the dialog open to a sensible size without capping what it can show.
class _Placeholder extends StatelessWidget {
  final Widget child;

  const _Placeholder({required this.child});

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: const BoxConstraints(minHeight: 120),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Center(child: child),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  final AiConversation conversation;
  final bool current;
  final VoidCallback onOpen;
  final VoidCallback onDelete;

  const _Row({
    required this.conversation,
    required this.current,
    required this.onOpen,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final t = context.af;

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: current ? t.sunken : t.panel,
        borderRadius: t.borderRadius,
        border: Border.all(color: current ? t.accent : t.line),
      ),
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          onTap: onOpen,
          borderRadius: t.borderRadius,
          highlightColor: t.accentSoft,
          splashColor: t.accentSoft,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(13, 11, 6, 11),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        conversation.title,
                        style: AFText.body(context),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 5),
                      Text(
                        '${_stamp.format(conversation.updatedAt)} · '
                        '${conversation.turns.length} turns'
                        '${current ? ' · open' : ''}',
                        style: AFText.meta(
                          context,
                          color: current ? t.accent : t.muted,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 6),
                AFIconButton(
                  icon: Icons.delete_outline,
                  tooltip: 'Delete conversation',
                  bordered: false,
                  onPressed: onDelete,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
