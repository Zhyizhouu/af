import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../db/database_helper.dart';
import '../../theme/af_text.dart';
import '../../theme/af_tokens.dart';
import 'calendar_provider.dart';
import 'event_editor_dialog.dart';

/// Where one entry sits inside a day column once overlaps are resolved.
class Placement {
  final AgendaEntry entry;

  /// Which side-by-side slot this entry occupies.
  final int column;

  /// How many slots its overlap cluster needs, and so how wide each one is.
  final int columns;

  const Placement(this.entry, this.column, this.columns);
}

/// Assigns side-by-side columns to overlapping entries.
///
/// Entries are grouped into clusters that overlap transitively; within a
/// cluster each entry takes the first column whose previous entry has already
/// ended. Every entry in a cluster is then drawn at the same width, which is
/// what makes overlapping blocks line up instead of staggering.
List<Placement> layoutDay(List<AgendaEntry> entries, DateTime day) {
  if (entries.isEmpty) return const [];

  final timed = entries.where((entry) => !entry.allDay).toList()
    ..sort((a, b) => a.start.compareTo(b.start));
  if (timed.isEmpty) return const [];

  final placements = <Placement>[];
  var cluster = <AgendaEntry>[];
  var clusterEnd = DateTime.fromMillisecondsSinceEpoch(0);

  void flush() {
    if (cluster.isEmpty) return;

    final columnEnds = <DateTime>[];
    final assigned = <AgendaEntry, int>{};

    for (final entry in cluster) {
      var column = columnEnds.indexWhere((end) => !end.isAfter(entry.start));
      if (column == -1) {
        columnEnds.add(_effectiveEnd(entry));
        column = columnEnds.length - 1;
      } else {
        columnEnds[column] = _effectiveEnd(entry);
      }
      assigned[entry] = column;
    }

    for (final entry in cluster) {
      placements.add(Placement(entry, assigned[entry]!, columnEnds.length));
    }
    cluster = [];
  }

  for (final entry in timed) {
    if (cluster.isNotEmpty && !entry.start.isBefore(clusterEnd)) flush();
    cluster.add(entry);
    final end = _effectiveEnd(entry);
    if (end.isAfter(clusterEnd)) clusterEnd = end;
  }
  flush();

  return placements;
}

/// Proctor sessions have no duration, so give them a readable block instead
/// of a zero-height sliver.
DateTime _effectiveEnd(AgendaEntry entry) {
  const minimum = Duration(minutes: 30);
  if (entry.end.difference(entry.start) >= minimum) return entry.end;
  return entry.start.add(minimum);
}

/// Day / 3-Day / Week: days as columns against a 24-hour axis.
class CalendarTimeGrid extends ConsumerStatefulWidget {
  final List<DateTime> days;
  final Map<DateTime, List<AgendaEntry>> buckets;

  const CalendarTimeGrid({
    super.key,
    required this.days,
    required this.buckets,
  });

  @override
  ConsumerState<CalendarTimeGrid> createState() => _CalendarTimeGridState();
}

class _CalendarTimeGridState extends ConsumerState<CalendarTimeGrid> {
  static const double _hourHeight = 52;
  static const double _gutterWidth = 52;

  static final DateFormat _weekday = DateFormat('EEE');
  static final DateFormat _dayNumber = DateFormat('d');

  late final ScrollController _scroll = ScrollController(
    // Open on the working day rather than at midnight.
    initialScrollOffset: 7 * _hourHeight,
  );

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.af;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        _header(context),
        _allDayRow(context),
        SizedBox(
          // Bounded so the hour axis scrolls inside the panel instead of
          // making the whole page 24 hours tall.
          height: math.min(MediaQuery.sizeOf(context).height * 0.62, 640),
          child: SingleChildScrollView(
            controller: _scroll,
            child: SizedBox(
              height: 24 * _hourHeight,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _hourGutter(context),
                  for (var i = 0; i < widget.days.length; i++)
                    Expanded(
                      child: _DayColumn(
                        day: widget.days[i],
                        entries: widget.buckets[widget.days[i]] ?? const [],
                        hourHeight: _hourHeight,
                        showRightBorder: i < widget.days.length - 1,
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
        Container(height: 1, color: t.line),
      ],
    );
  }

  Widget _header(BuildContext context) {
    final t = context.af;
    final today = dayKey(DateTime.now());

    return Container(
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: t.line)),
      ),
      child: Row(
        children: [
          SizedBox(width: _gutterWidth),
          for (final day in widget.days)
            Expanded(
              child: GestureDetector(
                onTap: () =>
                    ref.read(calendarAnchorProvider.notifier).state = day,
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  alignment: Alignment.center,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        _weekday.format(day).toUpperCase(),
                        style: AFText.mono(
                          size: 10,
                          color: t.muted,
                          weight: FontWeight.w700,
                          letterSpacing: 0.8,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Container(
                        width: 24,
                        height: 22,
                        alignment: Alignment.center,
                        decoration: isSameDay(day, today)
                            ? BoxDecoration(
                                color: t.ink,
                                borderRadius: BorderRadius.circular(2),
                              )
                            : null,
                        child: Text(
                          _dayNumber.format(day),
                          style: AFText.mono(
                            size: 14,
                            color: isSameDay(day, today) ? t.onInk : t.ink,
                            weight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _allDayRow(BuildContext context) {
    final t = context.af;

    final hasAllDay = widget.days.any(
      (day) => (widget.buckets[day] ?? const []).any((entry) => entry.allDay),
    );
    if (!hasAllDay) return const SizedBox.shrink();

    return Container(
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: t.line)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: _gutterWidth,
            child: Padding(
              padding: const EdgeInsets.only(right: 6, top: 6),
              child: Text(
                'all-day',
                textAlign: TextAlign.right,
                style: AFText.mono(size: 9.5, color: t.muted),
              ),
            ),
          ),
          for (final day in widget.days)
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(3),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    for (final entry in (widget.buckets[day] ?? const [])
                        .where((entry) => entry.allDay))
                      _EntryBlock(entry: entry, day: day, compact: true),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _hourGutter(BuildContext context) {
    final t = context.af;

    return SizedBox(
      width: _gutterWidth,
      child: Stack(
        children: [
          for (var hour = 1; hour < 24; hour++)
            Positioned(
              top: hour * _hourHeight - 6,
              right: 6,
              child: Text(
                '${hour.toString().padLeft(2, '0')}:00',
                style: AFText.mono(size: 10, color: t.muted),
              ),
            ),
        ],
      ),
    );
  }
}

class _DayColumn extends ConsumerWidget {
  final DateTime day;
  final List<AgendaEntry> entries;
  final double hourHeight;
  final bool showRightBorder;

  const _DayColumn({
    required this.day,
    required this.entries,
    required this.hourHeight,
    required this.showRightBorder,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.af;
    final placements = layoutDay(entries, day);
    final now = DateTime.now();

    return Container(
      decoration: BoxDecoration(
        border: Border(
          right:
              showRightBorder ? BorderSide(color: t.line) : BorderSide.none,
        ),
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final width = constraints.maxWidth;

          return Stack(
            children: [
              for (var hour = 1; hour < 24; hour++)
                Positioned(
                  top: hour * hourHeight,
                  left: 0,
                  right: 0,
                  child: Container(height: 1, color: t.line),
                ),

              // Tap empty space to create an event at that hour.
              Positioned.fill(
                child: GestureDetector(
                  behavior: HitTestBehavior.translucent,
                  onTapUp: (details) {
                    final hour =
                        (details.localPosition.dy / hourHeight).floor().clamp(0, 23);
                    showDialog(
                      context: context,
                      builder: (_) => EventEditorDialog(
                        initialDay: day,
                        initialHour: hour,
                      ),
                    );
                  },
                ),
              ),

              for (final placement in placements)
                _positioned(placement, width),

              if (isSameDay(day, now)) _nowLine(context, now),
            ],
          );
        },
      ),
    );
  }

  Widget _positioned(Placement placement, double width) {
    final entry = placement.entry;
    final start = entry.start;
    final end = _effectiveEnd(entry);

    final top = (start.hour + start.minute / 60) * hourHeight;
    final rawHeight =
        (end.difference(start).inMinutes / 60) * hourHeight;

    const gap = 2.0;
    final columnWidth = (width - gap) / placement.columns;

    return Positioned(
      top: top,
      left: placement.column * columnWidth + gap,
      width: columnWidth - gap,
      // One line of mono plus padding needs ~24px; never draw thinner.
      height: math.max(rawHeight - gap, 24),
      child: _EntryBlock(entry: entry, day: day),
    );
  }

  Widget _nowLine(BuildContext context, DateTime now) {
    final t = context.af;
    return Positioned(
      top: (now.hour + now.minute / 60) * hourHeight,
      left: 0,
      right: 0,
      child: Row(
        children: [
          Container(
            width: 7,
            height: 7,
            decoration: BoxDecoration(color: t.warn, shape: BoxShape.circle),
          ),
          Expanded(child: Container(height: 1.5, color: t.warn)),
        ],
      ),
    );
  }
}

class _EntryBlock extends ConsumerWidget {
  final AgendaEntry entry;
  final DateTime day;
  final bool compact;

  const _EntryBlock({
    required this.entry,
    required this.day,
    this.compact = false,
  });

  static final DateFormat _time = DateFormat('HH:mm');

  Widget _title(BuildContext context, {required int maxLines}) => Text(
        entry.title,
        maxLines: maxLines,
        overflow: TextOverflow.ellipsis,
        style: AFText.mono(
          size: 10.5,
          color: context.af.ink,
          weight: FontWeight.w600,
        ),
      );

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return GestureDetector(
      onTap: () => openAgendaEntry(context, entry, day),
      child: Container(
        width: double.infinity,
        margin: compact ? const EdgeInsets.only(bottom: 3) : EdgeInsets.zero,
        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 3),
        decoration: BoxDecoration(
          color: entry.color.withValues(alpha: 0.16),
          borderRadius: BorderRadius.circular(2),
          border: Border(left: BorderSide(color: entry.color, width: 2.5)),
        ),
        child: compact
            ? _title(context, maxLines: 1)
            // A timed block is sized by its duration, so the text has to fit
            // whatever height that gives it — a half-hour slot has room for
            // one line and nothing else.
            : LayoutBuilder(
                builder: (context, constraints) {
                  final height = constraints.maxHeight;
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Flexible(
                        child: _title(
                          context,
                          maxLines: height >= 42 ? 2 : 1,
                        ),
                      ),
                      if (!entry.allDay && height >= 30)
                        Text(
                          _time.format(entry.start),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AFText.mono(
                            size: 9.5,
                            color: context.af.muted,
                          ),
                        ),
                    ],
                  );
                },
              ),
      ),
    );
  }
}

/// Opens whatever an agenda row points at: Calendar events open the editor,
/// proctor sessions belong to Checklists and navigate there instead.
void openAgendaEntry(BuildContext context, AgendaEntry entry, DateTime day) {
  if (entry.route != null) {
    context.go(entry.route!);
    return;
  }
  final event = DatabaseHelper.instance.calendarEventsBox.get(entry.id);
  if (event == null) return;
  showDialog(
    context: context,
    builder: (_) => EventEditorDialog(event: event, initialDay: day),
  );
}
