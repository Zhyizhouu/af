import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../db/database_helper.dart';
import '../db/seed_habits.dart';
import '../db/sync_migration.dart';
import '../sync/sync_controller.dart';
import 'data_refresh.dart';

/// Keeps the open database scope in step with whoever is signed in.
///
/// Signing in does not merge accounts any more: the boxes are swapped for that
/// uid's own set, so the previous account's records are neither shown nor
/// pushed into the new account's Firestore subtree.
///
/// Signing out swaps back to [DatabaseHelper.localScope] rather than deleting
/// anything — the account's data stays on disk under its own scope and comes
/// back when it signs in again.
class DataScopeController extends StateNotifier<String> {
  final Ref ref;

  DataScopeController(this.ref) : super(DatabaseHelper.instance.scope);

  /// Switches to [uid]'s data, or back to the local scope when null.
  Future<void> switchTo(String? uid) async {
    final scope = uid ?? DatabaseHelper.localScope;
    final db = DatabaseHelper.instance;
    if (scope == db.scope) return;

    await db.openScope(scope);
    // Per-scope startup work: a scope that has never been opened needs its
    // starter habit, and one written before sync existed needs its ids
    // backfilled. Both are idempotent.
    await seedHabitsIfEmpty();
    await runSyncMigration();

    state = scope;
    refreshAllData(ref);

    // Pull the account's own records down. Signing out has nothing to sync.
    if (uid != null) {
      await ref.read(syncControllerProvider.notifier).syncNow();
    }
  }
}

final dataScopeProvider =
    StateNotifierProvider<DataScopeController, String>(
  (ref) => DataScopeController(ref),
);
