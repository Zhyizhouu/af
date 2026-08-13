import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_controller.dart';
import '../programs/calendar/calendar_provider.dart';
import '../programs/calendar/category_provider.dart';
import '../providers/session_provider.dart';
import 'sync_service.dart';

enum SyncStatus { signedOut, idle, syncing, synced, failed }

class SyncState {
  final SyncStatus status;
  final DateTime? lastSyncedAt;
  final String? error;

  const SyncState({
    this.status = SyncStatus.signedOut,
    this.lastSyncedAt,
    this.error,
  });

  SyncState copyWith({
    SyncStatus? status,
    DateTime? lastSyncedAt,
    String? error,
  }) =>
      SyncState(
        status: status ?? this.status,
        lastSyncedAt: lastSyncedAt ?? this.lastSyncedAt,
        error: error,
      );
}

/// Drives [SyncService] and exposes something the UI can show.
///
/// Sync is explicit rather than continuous: it runs on sign-in, after local
/// writes (debounced), and on demand. A live Firestore listener would be
/// nicer, but AF is local-first — Hive stays the source of truth for reads, so
/// there is nothing to stream into.
class SyncController extends StateNotifier<SyncState> {
  final Ref ref;
  Timer? _debounce;

  SyncController(this.ref) : super(const SyncState());

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  /// Coalesces the burst of writes that a single user action produces.
  void requestSync() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(seconds: 2), syncNow);
  }

  Future<void> syncNow() async {
    final user = ref.read(currentUserProvider);
    if (user == null) {
      state = const SyncState(status: SyncStatus.signedOut);
      return;
    }
    if (state.status == SyncStatus.syncing) return;

    state = state.copyWith(status: SyncStatus.syncing);

    try {
      await SyncService().syncAll(user.uid);

      // Hive is read through these providers, so anything pulled down is only
      // visible once they are refreshed.
      ref
        ..invalidate(activeSessionsProvider)
        ..invalidate(archivedSessionsProvider)
        ..invalidate(sessionChecklistProvider)
        ..invalidate(calendarEventsProvider)
        ..invalidate(categoriesProvider);

      state = SyncState(
        status: SyncStatus.synced,
        lastSyncedAt: DateTime.now(),
      );
    } catch (error) {
      state = state.copyWith(
        status: SyncStatus.failed,
        error: error.toString(),
      );
    }
  }
}

final syncControllerProvider =
    StateNotifierProvider<SyncController, SyncState>(
  (ref) => SyncController(ref),
);
