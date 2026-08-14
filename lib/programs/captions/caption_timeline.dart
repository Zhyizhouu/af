import 'package:flutter/material.dart';

import '../../theme/af_text.dart';
import '../../theme/af_tokens.dart';
import 'caption_api.dart';

/// The captions laid out against time, the way an editing timeline shows them.
///
/// A list tells you what the captions say; this tells you where the gaps are,
/// which is the thing a transcript gets wrong. A model that has drifted leaves
/// a visible pattern — blocks bunched early, a hole where it lost its place —
/// and that is far easier to see here than to read out of timestamps.
class CaptionTimeline extends StatefulWidget {
  final List<CaptionSegment> segments;
  final double seconds;
  final int? selected;
  final ValueChanged<int> onSelect;

  /// Horizontal scale. Larger spreads the captions out for fine work.
  final double pixelsPerSecond;

  const CaptionTimeline({
    super.key,
    required this.segments,
    required this.seconds,
    required this.selected,
    required this.onSelect,
    this.pixelsPerSecond = 12,
  });

  static const double height = 74;

  @override
  State<CaptionTimeline> createState() => _CaptionTimelineState();
}

class _CaptionTimelineState extends State<CaptionTimeline> {
  final _scroll = ScrollController();

  @override
  void didUpdateWidget(CaptionTimeline old) {
    super.didUpdateWidget(old);
    if (widget.selected != old.selected) _revealSelection();
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  /// Brings the selected block into view when the selection moves from
  /// somewhere else — stepping through with the arrows would otherwise walk
  /// the selection straight off the edge.
  void _revealSelection() {
    final index = widget.selected;
    if (index == null || index >= widget.segments.length) return;
    if (!_scroll.hasClients) return;

    final centre = widget.segments[index].start * widget.pixelsPerSecond;
    final viewport = _scroll.position.viewportDimension;
    final target = (centre - viewport / 2)
        .clamp(0.0, _scroll.position.maxScrollExtent);

    _scroll.animateTo(
      target,
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOut,
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = context.af;
    final width = (widget.seconds * widget.pixelsPerSecond).clamp(320.0, 1e6);

    return Container(
      height: CaptionTimeline.height,
      decoration: BoxDecoration(
        color: t.sunken,
        borderRadius: t.borderRadius,
        border: Border.all(color: t.line),
      ),
      clipBehavior: Clip.antiAlias,
      child: Scrollbar(
        controller: _scroll,
        child: SingleChildScrollView(
          controller: _scroll,
          scrollDirection: Axis.horizontal,
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTapDown: (details) => _selectAt(details.localPosition.dx),
            child: CustomPaint(
              size: Size(width.toDouble(), CaptionTimeline.height),
              painter: _TimelinePainter(
                segments: widget.segments,
                seconds: widget.seconds,
                selected: widget.selected,
                pixelsPerSecond: widget.pixelsPerSecond,
                palette: _Palette(
                  ruler: t.lineStrong,
                  rulerText: t.muted,
                  block: t.lineStrong,
                  blockSelected: t.accent,
                  ground: t.panel,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// Picks the block under the tap, or the nearest one if the tap landed in a
  /// gap — a miss by two pixels should not do nothing.
  void _selectAt(double dx) {
    if (widget.segments.isEmpty) return;
    final at = dx / widget.pixelsPerSecond;

    var best = 0;
    var bestDistance = double.infinity;

    for (var i = 0; i < widget.segments.length; i++) {
      final segment = widget.segments[i];
      if (at >= segment.start && at <= segment.end) {
        widget.onSelect(i);
        return;
      }
      final distance = at < segment.start ? segment.start - at : at - segment.end;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    }
    widget.onSelect(best);
  }
}

class _Palette {
  final Color ruler;
  final Color rulerText;
  final Color block;
  final Color blockSelected;
  final Color ground;

  const _Palette({
    required this.ruler,
    required this.rulerText,
    required this.block,
    required this.blockSelected,
    required this.ground,
  });
}

class _TimelinePainter extends CustomPainter {
  final List<CaptionSegment> segments;
  final double seconds;
  final int? selected;
  final double pixelsPerSecond;
  final _Palette palette;

  _TimelinePainter({
    required this.segments,
    required this.seconds,
    required this.selected,
    required this.pixelsPerSecond,
    required this.palette,
  });

  static const double _rulerHeight = 22;

  @override
  void paint(Canvas canvas, Size size) {
    _paintRuler(canvas, size);
    _paintBlocks(canvas, size);
  }

  void _paintRuler(Canvas canvas, Size size) {
    final line = Paint()
      ..color = palette.ruler
      ..strokeWidth = 1;

    canvas.drawLine(
      Offset(0, _rulerHeight),
      Offset(size.width, _rulerHeight),
      line,
    );

    // A tick every ~80px, rounded to a interval a person reads without
    // arithmetic. Marks every 7 seconds are worse than useless.
    final step = _tickInterval(80 / pixelsPerSecond);

    for (var at = 0.0; at <= seconds; at += step) {
      final x = at * pixelsPerSecond;
      canvas.drawLine(Offset(x, _rulerHeight - 6), Offset(x, _rulerHeight), line);

      final label = TextPainter(
        text: TextSpan(
          text: formatTimecode(at, withMillis: false),
          style: AFText.mono(size: 9.5, color: palette.rulerText),
        ),
        textDirection: TextDirection.ltr,
      )..layout();

      // The last label would otherwise hang off the end of the canvas.
      final labelX = (x + 3).clamp(0.0, size.width - label.width);
      label.paint(canvas, Offset(labelX, 3));
    }
  }

  void _paintBlocks(Canvas canvas, Size size) {
    const top = _rulerHeight + 10;
    final bottom = size.height - 10;

    for (var i = 0; i < segments.length; i++) {
      final segment = segments[i];
      final left = segment.start * pixelsPerSecond;
      // A one-word caption is a few pixels wide at this scale; a floor keeps
      // it clickable and visible.
      final width =
          (segment.duration * pixelsPerSecond).clamp(3.0, double.infinity);
      final isSelected = i == selected;

      final rect = RRect.fromLTRBR(
        left,
        top,
        left + width,
        bottom,
        const Radius.circular(2),
      );

      canvas.drawRRect(
        rect,
        Paint()
          ..color = isSelected
              ? palette.blockSelected
              : palette.block.withValues(alpha: 0.55),
      );

      if (isSelected) {
        // A hairline outline so the selection still reads on a block only
        // three pixels wide.
        canvas.drawRRect(
          RRect.fromLTRBR(left - 1, top - 2, left + width + 1, bottom + 2,
              const Radius.circular(2)),
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = 1.4
            ..color = palette.blockSelected,
        );
      }
    }
  }

  /// Rounds a raw seconds-per-tick up to something with a whole number of
  /// seconds, minutes or five minutes in it.
  static double _tickInterval(double raw) {
    for (final candidate in const [1.0, 2, 5, 10, 15, 30, 60, 120, 300, 600]) {
      if (raw <= candidate) return candidate.toDouble();
    }
    return 900;
  }

  @override
  bool shouldRepaint(_TimelinePainter old) =>
      old.segments != segments ||
      old.selected != selected ||
      old.pixelsPerSecond != pixelsPerSecond ||
      old.seconds != seconds;
}

/// `MM:SS` or `MM:SS.mmm` — the form an editing timeline shows, and the form
/// the time fields accept back.
String formatTimecode(double seconds, {bool withMillis = true}) {
  if (seconds < 0) seconds = 0;
  final total = (seconds * 1000).round();
  final millis = total % 1000;
  final wholeSeconds = total ~/ 1000;

  final minutes = wholeSeconds ~/ 60;
  final rest = wholeSeconds % 60;
  final base = '$minutes:${rest.toString().padLeft(2, '0')}';

  return withMillis ? '$base.${millis.toString().padLeft(3, '0')}' : base;
}

/// Reads `MM:SS.mmm`, `SS.mmm` or plain seconds back. Null when it is not a
/// time at all, so a half-typed value leaves the segment alone.
double? parseTimecode(String input) {
  final text = input.trim();
  if (text.isEmpty) return null;

  final parts = text.split(':');
  if (parts.length > 2) return null;

  if (parts.length == 1) {
    final seconds = double.tryParse(parts[0]);
    return seconds != null && seconds >= 0 ? seconds : null;
  }

  final minutes = int.tryParse(parts[0]);
  final seconds = double.tryParse(parts[1]);
  if (minutes == null || seconds == null || minutes < 0 || seconds < 0) {
    return null;
  }
  return minutes * 60 + seconds;
}
