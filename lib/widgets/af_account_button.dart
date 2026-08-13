import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../auth/auth_controller.dart';
import '../sync/sync_controller.dart';
import '../theme/af_text.dart';
import '../theme/af_tokens.dart';
import 'af_button.dart';

/// Account and sync control for the masthead / nav bar.
///
/// Signed out it is a plain "Sign in" button; signed in it becomes an initial
/// disc that opens sync status and sign-out.
class AFAccountButton extends ConsumerWidget {
  const AFAccountButton({super.key});

  static final DateFormat _time = DateFormat('HH:mm');

  Future<void> _signIn(BuildContext context, WidgetRef ref) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(authControllerProvider).signInWithGoogle();
      await ref.read(syncControllerProvider.notifier).syncNow();
    } catch (error) {
      messenger.showSnackBar(
        SnackBar(content: Text(describeAuthError(error))),
      );
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.af;
    final user = ref.watch(currentUserProvider);
    final sync = ref.watch(syncControllerProvider);

    if (user == null) {
      return AFButton.ghost(
        label: 'Sign in',
        icon: Icons.person_outline,
        onPressed: () => _signIn(context, ref),
      );
    }

    final label = (user.displayName?.trim().isNotEmpty ?? false)
        ? user.displayName!.trim()
        : (user.email ?? 'Account');
    final initial = label.characters.first.toUpperCase();

    return PopupMenuButton<String>(
      tooltip: label,
      offset: const Offset(0, 40),
      onSelected: (value) async {
        switch (value) {
          case 'sync':
            await ref.read(syncControllerProvider.notifier).syncNow();
          case 'signout':
            await ref.read(authControllerProvider).signOut();
        }
      },
      itemBuilder: (context) => [
        PopupMenuItem<String>(
          enabled: false,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: AFText.body(context)),
              if (user.email != null)
                Text(user.email!, style: AFText.meta(context)),
              const SizedBox(height: 6),
              Text(
                _statusLine(sync),
                style: AFText.meta(
                  context,
                  color: sync.status == SyncStatus.failed ? t.warn : t.accent,
                ),
              ),
            ],
          ),
        ),
        const PopupMenuDivider(),
        PopupMenuItem<String>(
          value: 'sync',
          child: Text(
            sync.status == SyncStatus.syncing ? 'Syncing…' : 'Sync now',
            style: AFText.body(context),
          ),
        ),
        PopupMenuItem<String>(
          value: 'signout',
          child: Text(
            'Sign out',
            style: AFText.body(context, color: t.warn),
          ),
        ),
      ],
      child: Container(
        width: 32,
        height: 32,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: sync.status == SyncStatus.failed ? t.warnSoft : t.accentSoft,
          borderRadius: t.borderRadius,
          border: Border.all(
            color: sync.status == SyncStatus.failed ? t.warn : t.accent,
          ),
        ),
        child: sync.status == SyncStatus.syncing
            ? SizedBox(
                width: 13,
                height: 13,
                child: CircularProgressIndicator(
                  strokeWidth: 1.6,
                  color: t.accent,
                ),
              )
            : Text(
                initial,
                style: AFText.mono(
                  size: 13,
                  color: sync.status == SyncStatus.failed ? t.warn : t.accent,
                  weight: FontWeight.w700,
                ),
              ),
      ),
    );
  }

  String _statusLine(SyncState sync) => switch (sync.status) {
        SyncStatus.signedOut => 'not syncing',
        SyncStatus.idle => 'waiting to sync',
        SyncStatus.syncing => 'syncing…',
        SyncStatus.synced => sync.lastSyncedAt == null
            ? 'synced'
            : 'synced ${_time.format(sync.lastSyncedAt!)}',
        SyncStatus.failed => 'sync failed — tap Sync now',
      };
}
