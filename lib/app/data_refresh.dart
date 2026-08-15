import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../programs/ai/ai_conversation_store.dart';
import '../programs/calendar/calendar_provider.dart';
import '../programs/calendar/category_provider.dart';
import '../programs/habits/habit_provider.dart';
import '../providers/session_provider.dart';

/// Drops every cached read of the local database.
///
/// Hive is read through these providers, so anything that changes the bytes
/// underneath them — a sync pull, or swapping to another account's scope — is
/// invisible until they are invalidated. One list, called from both places, so
/// adding a program cannot leave one of them behind.
void refreshAllData(Ref ref) {
  ref
    ..invalidate(activeSessionsProvider)
    ..invalidate(archivedSessionsProvider)
    ..invalidate(sessionChecklistProvider)
    ..invalidate(calendarEventsProvider)
    ..invalidate(categoriesProvider)
    ..invalidate(habitsProvider)
    ..invalidate(habitDaysProvider)
    ..invalidate(aiConversationsProvider);
}
