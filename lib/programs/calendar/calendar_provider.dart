import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../db/database_helper.dart';
import '../../models/calendar_event.dart';
import '../../models/proctor_session.dart';
import '../../providers/session_provider.dart';
import '../../sync/sync_controller.dart';

const _uuid = Uuid();

/// Event colours, fixed rather than token-derived so an event keeps its
/// identity when the theme flips. Each is a mid-tone that stays legible on
/// both the light and the dark panel.
const List<Color> afEventColors = [
  Color(0xFF4C5BFF),
  Color(0xFF3E9E5C),
  Color(0xFFC95A2C),
  Color(0xFF8B5CF6),
  Color(0xFF1699B0),
  Color(0xFFDB4A80),
];

Color afEventColor(int index) =>
    afEventColors[index % afEventColors.length];

/// Midnight on the same day — the key used to bucket entries by date.
DateTime dayKey(DateTime value) =>
    DateTime(value.year, value.month, value.day);

bool isSameDay(DateTime a, DateTime b) =>
    a.year == b.year && a.month == b.month && a.day == b.day;

final calendarEventsProvider = FutureProvider<List<CalendarEvent>>((ref) async {
  return DatabaseHelper.instance.getCalendarEvents();
});

/// The month currently on screen, normalised to its first day.
final calendarMonthProvider = StateProvider<DateTime>((ref) {
  final now = DateTime.now();
  return DateTime(now.year, now.month);
});

final calendarSelectedDayProvider = StateProvider<DateTime>((ref) {
  return dayKey(DateTime.now());
});

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
    int colorIndex = 0,
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
      colorIndex: colorIndex,
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
  final Color color;

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
    required this.color,
    this.route,
  });

  factory AgendaEntry.fromEvent(CalendarEvent event) => AgendaEntry(
        kind: AgendaKind.event,
        id: event.id,
        title: event.title,
        subtitle: event.notes,
        start: event.start,
        end: event.end,
        allDay: event.allDay,
        color: afEventColor(event.colorIndex),
      );

  factory AgendaEntry.fromSession(ProctorSession session, Color color) {
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
      color: color,
      route: '/checklists/${session.key}',
    );
  }
}

/// Every agenda entry, sessions and events together, sorted by start time.
final agendaProvider = FutureProvider<List<AgendaEntry>>((ref) async {
  final events = await ref.watch(calendarEventsProvider.future);
  final active = await ref.watch(activeSessionsProvider.future);
  final archived = await ref.watch(archivedSessionsProvider.future);

  final entries = <AgendaEntry>[
    for (final event in events) AgendaEntry.fromEvent(event),
    for (final session in [...active, ...archived])
      AgendaEntry.fromSession(session, afEventColor(1)),
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
final upcomingAgendaProvider = FutureProvider<List<AgendaEntry>>((ref) async {
  final entries = await ref.watch(agendaProvider.future);
  final now = DateTime.now();
  return entries.where((entry) => !entry.end.isBefore(now)).take(6).toList();
});
