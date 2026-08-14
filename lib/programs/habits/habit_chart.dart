import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../theme/af_text.dart';
import '../../theme/af_tokens.dart';
import '../../widgets/af_segmented.dart';
import 'habit_range.dart';

/// The range switcher, in the same shape as the calendar's view control.
class HabitRangeBar extends ConsumerWidget {
  /// Uses the one-or-two letter labels, for the dashboard panel header.
  final bool short;

  const HabitRangeBar({super.key, this.short = true});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final range = ref.watch(habitRangeProvider);

    return AFSegmented<HabitRange>(
      shrinkWrap: true,
      value: range,
      onChanged: (value) =>
          ref.read(habitRangeProvider.notifier).state = value,
      segments: [
        for (final value in HabitRange.values)
          AFSegment(
            value: value,
            label: short ? value.short : value.label,
          ),
      ],
    );
  }
}

/// Completion over time.
///
/// One measure, so one colour: every bar is the accent. Shading bars
/// darker-where-taller would burn the only free channel re-encoding the height
/// the reader can already see, and a 100%-day is not a *status*, so the ok/warn
/// tokens stay out of it.
class HabitChart extends ConsumerStatefulWidget {
  final double height;

  const HabitChart({super.key, this.height = 132});

  @override
  ConsumerState<HabitChart> createState() => _HabitChartState();
}

class _HabitChartState extends ConsumerState<HabitChart> {
  int? _selected;

  @override
  Widget build(BuildContext context) {
    final t = context.af;
    final range = ref.watch(habitRangeProvider);
    final series = ref.watch(habitSeriesProvider).valueOrNull;

    if (series == null || series.isEmpty) {
      return SizedBox(
        height: widget.height,
        child: Center(
          child: Text('No habits yet', style: AFText.meta(context)),
        ),
      );
    }

    // A single bar is not a chart — at the Day range the number *is* the
    // chart, so it gets a stat tile instead.
    if (range == HabitRange.day) {
      return SizedBox(
        height: widget.height,
        child: _TodayStat(bucket: series.last),
      );
    }

    final index = (_selected != null && _selected! < series.length)
        ? _selected!
        : series.lastIndexWhere((b) => b.completion != null);
    final focus = index >= 0 ? series[index] : null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // The read-out, so a value is never reachable only by hovering.
        Row(
          children: [
            Expanded(
              child: Text(
                focus?.fullLabel ?? '—',
                style: AFText.meta(context),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            Text(
              focus?.completion == null
                  ? 'no data'
                  : '${(focus!.completion! * 100).round()}%',
              style: AFText.mono(
                size: 12.5,
                color: focus?.completion == null ? t.muted : t.ink,
                weight: FontWeight.w700,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Expanded(
          child: _Bars(
            series: series,
            selected: index,
            onFocus: (value) => setState(() => _selected = value),
          ),
        ),
      ],
    );
  }
}

/// The Day range: one number, not one bar.
class _TodayStat extends StatelessWidget {
  final HabitBucket bucket;

  const _TodayStat({required this.bucket});

  @override
  Widget build(BuildContext context) {
    final t = context.af;
    final value = bucket.completion;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Text(
          value == null ? '—' : '${(value * 100).round()}%',
          // Mono against the usual advice for hero figures: in AF the monospace
          // face carries every value, and breaking that here would read as a
          // stray typeface rather than as emphasis.
          style: AFText.mono(
            size: 40,
            color: value == null ? t.muted : t.ink,
            weight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          bucket.fullLabel.toUpperCase(),
          style: AFText.mono(size: 10, color: t.muted, letterSpacing: 1),
        ),
      ],
    );
  }
}

class _Bars extends StatelessWidget {
  final List<HabitBucket> series;
  final int selected;
  final ValueChanged<int?> onFocus;

  const _Bars({
    required this.series,
    required this.selected,
    required this.onFocus,
  });

  /// Bars stay thin: three of them across a wide panel would otherwise become
  /// slabs, which reads loud and hides the shape of the data.
  static const double _maxBarWidth = 26;
  static const double _gap = 2;
  static const double _axisBand = 16;

  @override
  Widget build(BuildContext context) {
    final t = context.af;

    return LayoutBuilder(
      builder: (context, constraints) {
        final columnWidth = constraints.maxWidth / series.length;

        return MouseRegion(
          onExit: (_) => onFocus(null),
          child: Stack(
            children: [
              Positioned.fill(
                child: CustomPaint(
                  painter: _BarPainter(
                    series: series,
                    selected: selected,
                    barWidth:
                        (columnWidth - _gap).clamp(1.0, _maxBarWidth),
                    axisBand: _axisBand,
                    accent: t.accent,
                    track: t.accentSoft,
                    grid: t.line,
                    tick: t.muted,
                    tickStyle: AFText.mono(size: 9, color: t.muted),
                  ),
                ),
              ),
              // Full-height hit columns, so a 4px-tall bar is still reachable.
              Row(
                children: [
                  for (var i = 0; i < series.length; i++)
                    Expanded(
                      child: MouseRegion(
                        onEnter: (_) => onFocus(i),
                        child: GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onTap: () => onFocus(i),
                          child: Semantics(
                            label: series[i].completion == null
                                ? '${series[i].fullLabel}, no data'
                                : '${series[i].fullLabel}, '
                                    '${(series[i].completion! * 100).round()}%',
                            child: const SizedBox.expand(),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }
}

class _BarPainter extends CustomPainter {
  final List<HabitBucket> series;
  final int selected;
  final double barWidth;
  final double axisBand;
  final Color accent;
  final Color track;
  final Color grid;
  final Color tick;
  final TextStyle tickStyle;

  _BarPainter({
    required this.series,
    required this.selected,
    required this.barWidth,
    required this.axisBand,
    required this.accent,
    required this.track,
    required this.grid,
    required this.tick,
    required this.tickStyle,
  });

  /// AF's ceiling. The design system allows nothing rounder, and it happens to
  /// be exactly the data-end radius a bar chart wants.
  static const double _radius = 4;

  @override
  void paint(Canvas canvas, Size size) {
    final plotHeight = size.height - axisBand;
    if (plotHeight <= 0) return;

    final hairline = Paint()
      ..color = grid
      ..strokeWidth = 1;

    // Solid hairlines, one shade off the surface — never dashed.
    for (final fraction in const [0.0, 0.5, 1.0]) {
      final y = plotHeight * fraction;
      canvas.drawLine(Offset(0, y), Offset(size.width, y), hairline);
    }

    // One scale label, not three. The top line is the only one that has to be
    // named for the rest to be readable, and it sits left of the first bar.
    TextPainter(
      text: TextSpan(text: '100%', style: tickStyle),
      textDirection: TextDirection.ltr,
    )
      ..layout()
      ..paint(canvas, const Offset(0, 2));

    final columnWidth = size.width / series.length;

    for (var i = 0; i < series.length; i++) {
      final centre = columnWidth * (i + 0.5);
      final left = centre - barWidth / 2;
      final value = series[i].completion;

      if (value == null) {
        // Absent, not zero — a month before you started tracking, say. A ghost
        // of the full slot says "nothing recorded here"; a stub at the baseline
        // would be indistinguishable from a day you scored and failed.
        canvas.drawRRect(
          RRect.fromRectAndCorners(
            Rect.fromLTWH(left, 0, barWidth, plotHeight),
            topLeft: const Radius.circular(_radius),
            topRight: const Radius.circular(_radius),
          ),
          Paint()..color = track,
        );
      } else {
        // A scored zero keeps a 2px stub so the column is visibly present.
        final barHeight = (plotHeight * value).clamp(2.0, plotHeight);
        final rect =
            Rect.fromLTWH(left, plotHeight - barHeight, barWidth, barHeight);
        final radius = Radius.circular(
          barHeight < _radius ? barHeight / 2 : _radius,
        );

        canvas.drawRRect(
          // Rounded at the data end only; square where it meets the baseline.
          RRect.fromRectAndCorners(rect, topLeft: radius, topRight: radius),
          Paint()
            ..color = i == selected ? accent : accent.withValues(alpha: 0.82),
        );
      }

      // Ticks are thinned rather than dropped, so the axis never turns to mush.
      final everyNth = (series.length / 12).ceil();
      if (i % everyNth == 0 || i == series.length - 1) {
        final painter = TextPainter(
          text: TextSpan(
            text: series[i].label,
            style: series[i].isToday
                ? tickStyle.copyWith(color: accent, fontWeight: FontWeight.w700)
                : tickStyle,
          ),
          textDirection: TextDirection.ltr,
        )..layout();
        painter.paint(
          canvas,
          Offset(centre - painter.width / 2, plotHeight + 4),
        );
      }
    }
  }

  @override
  bool shouldRepaint(_BarPainter old) =>
      old.series != series ||
      old.selected != selected ||
      old.barWidth != barWidth ||
      old.accent != accent;
}
