import 'package:flutter/material.dart';

import '../../theme/af_tokens.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../db/database_helper.dart';
import '../../models/calendar_event.dart';
import '../../models/proctor_session.dart';
import '../../providers/session_provider.dart';
import '../../sync/sync_controller.dart';
import 'category_provider.dart';
import 'event_category.dart';

const _uuid = Uuid();

/// Midnight on the same day — the key used to bucket entries by date.
DateTime dayKey(DateTime value) =>
    DateTime(value.year, value.month, value.day);

bool isSameDay(DateTime a, DateTime b) =>
    a.year == b.year && a.month == b.month && a.day == b.day;

final calendarEventsProvider = FutureProvider<List<CalendarEvent>>((ref) async {
  return DatabaseHelper.instance.getCalendarEvents();
});

/// The zoom levels the calendar can be viewed at.
enum CalendarView {
  year(label: 'Year', short: 'Y'),
  month(label: 'Month', short: 'M'),
  week(label: 'Week', short: 'W'),
  threeDay(label: '3 Day', short: '3D'),
  day(label: 'Day', short: 'D');

  const CalendarView({required this.label, required this.short});

  final String label;

  /// Used when the switcher has to fit on a phone.
  final String short;

  /// Whether this view lays days out against a time axis rather than as a
  /// grid of dates. Those views are full-bleed and have no agenda side panel.
  bool get isTimeGrid =>
      this == CalendarView.day ||
      this == CalendarView.threeDay ||
      this == CalendarView.week;
}

final calendarViewProvider =
    StateProvider<CalendarView>((ref) => CalendarView.month);

/// The single date the calendar is positioned on.
///
/// Every view derives its visible range from this one value, so switching
/// zoom levels keeps you where you were instead of jumping to today.
final calendarAnchorProvider =
    StateProvider<DateTime>((ref) => dayKey(DateTime.now()));

int daysInMonth(int year, int month) => DateTime(year, month + 1, 0).day;

/// The inclusive span of days [view] shows around [anchor].
({DateTime start, DateTime end}) visibleRange(
  CalendarView view,
  DateTime anchor,
) {
  final day = dayKey(anchor);
  switch (view) {
    case CalendarView.day:
      return (start: day, end: day);
    case CalendarView.threeDay:
      return (start: day, end: day.add(const Duration(days: 2)));
    case CalendarView.week:
      final monday =
          day.subtract(Duration(days: day.weekday - DateTime.monday));
      return (start: monday, end: monday.add(const Duration(days: 6)));
    case CalendarView.month:
      return (
        start: DateTime(day.year, day.month),
        end: DateTime(day.year, day.month, daysInMonth(day.year, day.month)),
      );
    case CalendarView.year:
      return (start: DateTime(day.year), end: DateTime(day.year, 12, 31));
  }
}

/// Moves the anchor one page forward (+1) or back (-1) in [view]'s own unit.
DateTime stepAnchor(CalendarView view, DateTime anchor, int direction) {
  switch (view) {
    case CalendarView.day:
      return anchor.add(Duration(days: direction));
    case CalendarView.threeDay:
      return anchor.add(Duration(days: 3 * direction));
    case CalendarView.week:
      return anchor.add(Duration(days: 7 * direction));
    case CalendarView.month:
      final month = anchor.month + direction;
      final target = DateTime(anchor.year, month);
      // Clamp so paging off the 31st does not skip a month.
      final day = anchor.day.clamp(1, daysInMonth(target.year, target.month));
      return DateTime(target.year, target.month, day);
    case CalendarView.year:
      final year = anchor.year + direction;
      final day = anchor.day.clamp(1, daysInMonth(year, anchor.month));
      return DateTime(year, anchor.month, day);
  }
}

class CalendarController {
  final Ref ref;

  CalendarController(this.ref);

  Future<CalendarEvent> save({
    /// Null creates a new event; otherwise the existing one is replaced.
    String? id,
    required String title,
    required DateTime start,
    required DateTime end,
    String notes = '',
    bool allDay = false,
    String category = 'other',
  }) async {
    final now = DateTime.now();
    final existing =
        id == null ? null : DatabaseHelper.instance.calendarEventsBox.get(id);

    final event = CalendarEvent(
      id: id ?? _uuid.v4(),
      title: title,
      notes: notes,
      start: start,
      end: end,
      allDay: allDay,
      category: category,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    );

    await DatabaseHelper.instance.putCalendarEvent(event);
    ref.invalidate(calendarEventsProvider);
    ref.read(syncControllerProvider.notifier).requestSync();
    return event;
  }

  Future<void> delete(String id) async {
    await DatabaseHelper.instance.deleteCalendarEvent(id);
    ref.invalidate(calendarEventsProvider);
    ref.read(syncControllerProvider.notifier).requestSync();
  }
}

final calendarControllerProvider =
    Provider((ref) => CalendarController(ref));

/// The colour to draw an agenda entry with, resolved against the current
/// theme. Sessions are not user-classified, so they take the accent.
Color agendaEntryColor(BuildContext context, AgendaEntry entry) =>
    entry.category?.color(context) ?? context.af.accent;

// ---- merged agenda ----

enum AgendaKind { event, session }

/// One row in an agenda list, from either program.
///
/// The Calendar shows its own events *and* proctor sessions, and the dashboard
/// shows both too, so the merge lives here rather than in either screen.
class AgendaEntry {
  final AgendaKind kind;
  final String id;
  final String title;
  final String subtitle;
  final DateTime start;
  final DateTime end;
  final bool allDay;

  /// Null for proctor sessions, which are not user-classified.
  final EventCategory? category;

  /// Whether this entry is already dealt with — a proctor session marked as
  /// finished, or swept into the archive. Calendar events have no such state.
  ///
  /// The calendar still shows these on their day, since the day happened; it
  /// is only the dashboard's forward-looking list that drops them.
  final bool finished;

  /// Where tapping the row should navigate, if anywhere.
  final String? route;

  const AgendaEntry({
    required this.kind,
    required this.id,
    required this.title,
    required this.subtitle,
    required this.start,
    required this.end,
    required this.allDay,
    required this.category,
    this.finished = false,
    this.route,
  });

  factory AgendaEntry.fromEvent(
    CalendarEvent event,
    Map<String, EventCategory> categories,
  ) =>
      AgendaEntry(
        kind: AgendaKind.event,
        id: event.id,
        title: event.title,
        subtitle: event.notes,
        start: event.start,
        end: event.end,
        allDay: event.allDay,
        // A slug can outlive its category; fall back rather than lose colour.
        category: categories[event.category] ?? fallbackCategory,
      );

  factory AgendaEntry.fromSession(ProctorSession session) {
    final label = [
      session.courseCode,
      session.courseName,
      session.courseClass,
    ].where((part) => part.isNotEmpty).join(' · ');

    return AgendaEntry(
      kind: AgendaKind.session,
      id: session.key.toString(),
      title: '${session.type} · Room ${session.room}',
      subtitle: label,
      start: session.dateTime,
      // Proctor sessions carry no duration; treat them as a point in time.
      end: session.dateTime,
      allDay: false,
      category: null,
      finished: session.status == 'archived',
      route: '/checklists/${session.key}',
    );
  }
}

/// Every agenda entry, sessions and events together, sorted by start time.
final agendaProvider = FutureProvider<List<AgendaEntry>>((ref) async {
  final events = await ref.watch(calendarEventsProvider.future);
  final categories = await ref.watch(categoryLookupProvider.future);
  final active = await ref.watch(activeSessionsProvider.future);
  final archived = await ref.watch(archivedSessionsProvider.future);

  final entries = <AgendaEntry>[
    for (final event in events) AgendaEntry.fromEvent(event, categories),
    for (final session in [...active, ...archived])
      AgendaEntry.fromSession(session),
  ]..sort((a, b) => a.start.compareTo(b.start));

  return entries;
});

/// Entries bucketed by day, for painting the month grid.
final agendaByDayProvider =
    FutureProvider<Map<DateTime, List<AgendaEntry>>>((ref) async {
  final entries = await ref.watch(agendaProvider.future);
  final buckets = <DateTime, List<AgendaEntry>>{};

  for (final entry in entries) {
    // Multi-day events appear on every day they touch.
    var day = dayKey(entry.start);
    final last = dayKey(entry.end);
    while (!day.isAfter(last)) {
      buckets.putIfAbsent(day, () => []).add(entry);
      day = day.add(const Duration(days: 1));
    }
  }

  return buckets;
});

final agendaForDayProvider =
    FutureProvider.family<List<AgendaEntry>, DateTime>((ref, day) async {
  final buckets = await ref.watch(agendaByDayProvider.future);
  return buckets[dayKey(day)] ?? const [];
});

/// The next few entries from now, for the dashboard.
///
/// Finished sessions are dropped even when their time has not passed: "Up
/// next" is what is still owed, and marking a session finished is the user
/// saying it no longer is.
final upcomingAgendaProvider = FutureProvider<List<AgendaEntry>>((ref) async {
  final entries = await ref.watch(agendaProvider.future);
  final now = DateTime.now();
  return entries
      .where((entry) => !entry.finished && !entry.end.isBefore(now))
      .take(6)
      .toList();
});
