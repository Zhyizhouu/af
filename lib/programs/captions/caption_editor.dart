import 'package:flutter/material.dart';

import '../../theme/af_text.dart';
import '../../theme/af_tokens.dart';
import '../../widgets/af_button.dart';
import '../../widgets/af_field.dart';
import '../../widgets/af_panel.dart';
import '../../widgets/af_segmented.dart';
import '../../widgets/af_text_field.dart';
import 'caption_api.dart';
import 'caption_timeline.dart';

/// The review step: the transcript on a timeline, editable, before it is
/// written into the video.
///
/// This exists because timings that come out of a model are close rather than
/// exact, and a caption that is close is a caption that is wrong. It is also
/// the only place in AF where the work is not finished when the job stops —
/// the workflow is parked, holding these segments, waiting.
class CaptionEditor extends StatefulWidget {
  final CaptionTranscript transcript;

  /// Seconds left before the workflow stops waiting and muxes as transcribed.
  final int reviewSeconds;

  final bool busy;
  final ValueChanged<List<CaptionSegment>> onApprove;
  final VoidCallback? onCancel;

  const CaptionEditor({
    super.key,
    required this.transcript,
    required this.reviewSeconds,
    required this.onApprove,
    this.busy = false,
    this.onCancel,
  });

  @override
  State<CaptionEditor> createState() => _CaptionEditorState();
}

class _CaptionEditorState extends State<CaptionEditor> {
  /// Zoom levels, in pixels per second of video.
  static const _zooms = [4.0, 12.0, 40.0];

  // A working copy: nothing is sent back until the button is pressed, so the
  // edits stay local and the job stays exactly as the server left it.
  late final List<CaptionSegment> _segments = [...widget.transcript.segments];
  final _text = TextEditingController();
  final _start = TextEditingController();
  final _end = TextEditingController();

  int? _selected;
  double _zoom = 12;
  bool _edited = false;

  @override
  void initState() {
    super.initState();
    if (_segments.isNotEmpty) _select(0);
  }

  @override
  void dispose() {
    _text.dispose();
    _start.dispose();
    _end.dispose();
    super.dispose();
  }

  void _select(int index) {
    if (index < 0 || index >= _segments.length) return;
    final segment = _segments[index];
    setState(() {
      _selected = index;
      _text.text = segment.text;
      _start.text = formatTimecode(segment.start);
      _end.text = formatTimecode(segment.end);
    });
  }

  /// Replaces the selected segment, keeping the list sorted and the times
  /// sane.
  ///
  /// Clamped against its neighbours rather than validated and refused: this
  /// runs on every keystroke in a time field, and an error message that
  /// appears while somebody is still typing is noise.
  void _update({double? start, double? end, String? text}) {
    final index = _selected;
    if (index == null) return;

    final current = _segments[index];
    var newStart = start ?? current.start;
    var newEnd = end ?? current.end;

    final floor = index == 0 ? 0.0 : _segments[index - 1].end;
    final ceiling = index == _segments.length - 1
        ? widget.transcript.seconds
        : _segments[index + 1].start;

    newStart = newStart.clamp(floor, ceiling > floor ? ceiling - 0.1 : floor);
    newEnd = newEnd.clamp(newStart + 0.1, ceiling > newStart ? ceiling : newStart + 0.1);

    setState(() {
      _segments[index] = current.copyWith(
        start: newStart,
        end: newEnd,
        text: text,
      );
      _edited = true;
    });
  }

  void _nudge(double byStart, double byEnd) {
    final index = _selected;
    if (index == null) return;

    final segment = _segments[index];
    _update(start: segment.start + byStart, end: segment.end + byEnd);

    // The fields are the source of truth for what is displayed, so they have
    // to follow a change made by a button rather than by typing.
    final updated = _segments[index];
    _start.text = formatTimecode(updated.start);
    _end.text = formatTimecode(updated.end);
  }

  void _delete() {
    final index = _selected;
    if (index == null || _segments.length <= 1) return;

    setState(() {
      _segments.removeAt(index);
      _edited = true;
    });
    _select(index.clamp(0, _segments.length - 1));
  }

  @override
  Widget build(BuildContext context) {
    final t = context.af;
    final selected = _selected;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AFPanel(
          label: 'Timeline',
          count: '${_segments.length} captions · '
              '${formatTimecode(widget.transcript.seconds, withMillis: false)}',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              CaptionTimeline(
                segments: _segments,
                seconds: widget.transcript.seconds,
                selected: _selected,
                onSelect: _select,
                pixelsPerSecond: _zoom,
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: AFSegmented<double>(
                      segments: const [
                        AFSegment(value: 4.0, label: 'Overview'),
                        AFSegment(value: 12.0, label: 'Normal'),
                        AFSegment(value: 40.0, label: 'Fine'),
                      ],
                      value: _zooms.contains(_zoom) ? _zoom : 12.0,
                      onChanged: (zoom) => setState(() => _zoom = zoom),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),
        if (selected != null) _segmentPanel(selected),
        const SizedBox(height: 18),
        _listPanel(),
        const SizedBox(height: 18),
        if (widget.reviewSeconds > 0)
          AFHint(
            'Left alone, this muxes as transcribed in '
            '${_countdown(widget.reviewSeconds)}.',
          ),
        const SizedBox(height: 10),
        AFButton(
          label: widget.busy
              ? 'Writing captions…'
              : _edited
                  ? 'Save edits and write captions'
                  : 'Write captions as transcribed',
          expand: true,
          icon: Icons.movie_creation_outlined,
          onPressed: widget.busy ? null : () => widget.onApprove(_segments),
        ),
        if (widget.onCancel != null) ...[
          const SizedBox(height: 10),
          AFButton.quiet(
            label: 'Discard this job',
            expand: true,
            onPressed: widget.busy ? null : widget.onCancel,
          ),
        ],
        const SizedBox(height: 6),
        Text(
          'The uploaded video is deleted once the captions are written.',
          textAlign: TextAlign.center,
          style: AFText.mono(size: 11, color: t.muted, letterSpacing: 0.2),
        ),
      ],
    );
  }

  Widget _segmentPanel(int index) {
    final segment = _segments[index];

    return AFPanel(
      label: 'Caption ${index + 1}',
      count: '${segment.duration.toStringAsFixed(1)}s',
      accented: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AFTextField(
            controller: _text,
            hint: 'What is said here',
            maxLines: 3,
            enabled: !widget.busy,
            onChanged: (value) => _update(text: value),
          ),
          Row(
            children: [
              Expanded(
                child: AFField(
                  label: 'In',
                  child: AFTextField(
                    controller: _start,
                    hint: 'm:ss.mmm',
                    enabled: !widget.busy,
                    onChanged: (value) {
                      final at = parseTimecode(value);
                      if (at != null) _update(start: at);
                    },
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: AFField(
                  label: 'Out',
                  child: AFTextField(
                    controller: _end,
                    hint: 'm:ss.mmm',
                    enabled: !widget.busy,
                    onChanged: (value) {
                      final at = parseTimecode(value);
                      if (at != null) _update(end: at);
                    },
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          // Nudging the whole block is the common correction: a model that
          // drifts is late or early by a constant, not wrong about how long
          // somebody spoke for.
          Row(
            children: [
              Expanded(
                child: AFButton.ghost(
                  label: '← 0.5s',
                  onPressed: widget.busy ? null : () => _nudge(-0.5, -0.5),
                  expand: true,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: AFButton.ghost(
                  label: '0.5s →',
                  onPressed: widget.busy ? null : () => _nudge(0.5, 0.5),
                  expand: true,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: AFButton.ghost(
                  label: 'Previous',
                  onPressed:
                      widget.busy || index == 0 ? null : () => _select(index - 1),
                  expand: true,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: AFButton.ghost(
                  label: 'Next',
                  onPressed: widget.busy || index >= _segments.length - 1
                      ? null
                      : () => _select(index + 1),
                  expand: true,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: AFButton.danger(
                  label: 'Delete',
                  onPressed:
                      widget.busy || _segments.length <= 1 ? null : _delete,
                  expand: true,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  /// Every caption in order, for finding the one that is wrong.
  ///
  /// Capped in height rather than let loose: a ninety-minute lecture is
  /// hundreds of rows, and a page that scrolls for a minute to reach the
  /// button at the bottom is unusable.
  Widget _listPanel() {
    final t = context.af;

    return AFPanel(
      label: 'All captions',
      count: '${_segments.length}',
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxHeight: 280),
        child: ListView.builder(
          shrinkWrap: true,
          itemCount: _segments.length,
          itemBuilder: (context, index) {
            final segment = _segments[index];
            final isSelected = index == _selected;

            return InkWell(
              onTap: () => _select(index),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 8),
                decoration: BoxDecoration(
                  border: Border(bottom: BorderSide(color: t.line)),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(
                      width: 66,
                      child: Text(
                        formatTimecode(segment.start, withMillis: false),
                        style: AFText.mono(
                          size: 11.5,
                          color: isSelected ? t.accent : t.muted,
                          weight: isSelected ? FontWeight.w700 : FontWeight.w500,
                        ),
                      ),
                    ),
                    Expanded(
                      child: Text(
                        segment.text,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: AFText.mono(
                          size: 12,
                          color: isSelected ? t.ink : t.muted,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

String _countdown(int seconds) {
  if (seconds >= 3600) {
    final hours = seconds ~/ 3600;
    return hours == 1 ? 'an hour' : '$hours hours';
  }
  if (seconds >= 60) return '${seconds ~/ 60} minutes';
  return '$seconds seconds';
}
