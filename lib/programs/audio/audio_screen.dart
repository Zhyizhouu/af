import 'dart:async';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../../app/file_delivery.dart';
import '../../widgets/af_button.dart';
import '../../widgets/af_field.dart';
import '../../widgets/af_panel.dart';
import '../../widgets/af_scaffold.dart';
import '../../widgets/af_segmented.dart';
import 'audio_api.dart';
import 'audio_job_panel.dart';

/// reAFresh · Audio — hand it a file, get it back in another format.
///
/// Unlike every other program in reAFresh this one is not local: the conversion runs
/// on a worker, orchestrated by Temporal, and this screen only uploads, polls
/// and downloads. That is why it is the one page that can say "not reachable".
class AudioScreen extends StatefulWidget {
  /// Injectable so tests can drive the whole flow without a container running.
  final AudioApi? api;

  const AudioScreen({super.key, this.api});

  @override
  State<AudioScreen> createState() => _AudioScreenState();
}

class _AudioScreenState extends State<AudioScreen> {
  /// Fast enough that a short file does not look stuck, slow enough that a
  /// long one is not a thousand requests.
  static const _pollEvery = Duration(milliseconds: 1200);

  /// Formats per row in the picker. Six across is unreadable at 390px, and
  /// letting the row scroll would hide options behind a gesture.
  static const _perRow = 3;

  late final AudioApi _api = widget.api ?? AudioApi();

  AudioLimits? _limits;
  String _format = 'mp3';
  int _bitrate = 192;

  Uint8List? _bytes;
  String _fileName = '';

  AudioJob? _job;
  Timer? _poll;

  /// Fraction of the upload sent, or null when nothing is going up.
  double? _uploaded;

  String? _error;
  String _toast = '';
  Timer? _toastTimer;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _loadLimits();
  }

  @override
  void dispose() {
    _poll?.cancel();
    _toastTimer?.cancel();
    // Only what this screen created: a caller that passed one owns it.
    if (widget.api == null) _api.close();
    super.dispose();
  }

  Future<void> _loadLimits() async {
    try {
      final limits = await _api.limits();
      if (!mounted) return;
      setState(() {
        _limits = limits;
        if (limits.formatById(limits.defaultFormat) != null) {
          _format = limits.defaultFormat;
        }
        if (limits.bitrates.contains(limits.defaultBitrate)) {
          _bitrate = limits.defaultBitrate;
        }
      });
    } on AudioError catch (error) {
      // Not fatal on its own — the converter may simply be down. Saying so up
      // front beats letting somebody pick a 200MB file and find out after.
      if (mounted) setState(() => _error = error.message);
    }
  }

  AudioFormat? get _selected => _limits?.formatById(_format);

  /// The bitrates the selected format actually accepts.
  List<int> get _rates =>
      _limits?.bitratesFor(_selected) ?? const [128, 192, 256, 320];

  /// Moves the chosen bitrate onto the new format's list.
  ///
  /// Without this, picking 320 for MP3 and then switching to Opus sends a
  /// bitrate libopus refuses — and the job fails a minute later rather than
  /// the control simply not offering it.
  void _chooseFormat(String id) {
    setState(() {
      _format = id;
      final rates = _rates;
      if (rates.isNotEmpty && !rates.contains(_bitrate)) {
        _bitrate = rates.reduce((a, b) => (a - _bitrate).abs() <= (b - _bitrate).abs() ? a : b);
      }
    });
  }

  // ---- actions ----

  Future<void> _pick() async {
    final result = await FilePicker.platform.pickFiles(
      // Deliberately not a format allowlist: ffmpeg reads far more than any
      // list would name, and guessing wrong means refusing a file that would
      // have converted.
      type: FileType.any,
      withData: true,
    );

    final file = result?.files.singleOrNull;
    if (file == null || file.bytes == null) return;

    final limit = _limits?.maxUploadBytes ?? 0;
    if (limit > 0 && file.size > limit) {
      setState(() => _error = 'That file is ${formatBytes(file.size)}. '
          'The limit is ${formatBytes(limit)}.');
      return;
    }

    _poll?.cancel();
    setState(() {
      _bytes = file.bytes;
      _fileName = file.name;
      _error = null;
      _job = null;
    });
  }

  Future<void> _convert() async {
    final bytes = _bytes;
    if (bytes == null || _busy) return;

    setState(() {
      _busy = true;
      _error = null;
      _job = null;
      // Non-null is what puts the panel on screen in its uploading state,
      // before any job exists to describe.
      _uploaded = 0;
    });

    try {
      final job = await _api.submit(
        bytes: bytes,
        fileName: _fileName,
        format: _format,
        bitrate: _bitrate,
        onProgress: (fraction) {
          // Fires many times a second on a fast connection; a whole-percent
          // gate keeps it from rebuilding the tree on every packet.
          if (!mounted) return;
          if ((fraction * 100).floor() == ((_uploaded ?? 0) * 100).floor()) {
            return;
          }
          setState(() => _uploaded = fraction);
        },
      );
      if (!mounted) return;
      setState(() {
        _job = job;
        _uploaded = null;
      });
      _startPolling(job.id);
    } on AudioError catch (error) {
      if (mounted) {
        setState(() {
          _error = error.message;
          _uploaded = null;
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _startPolling(String id) {
    _poll?.cancel();
    _poll = Timer.periodic(_pollEvery, (timer) async {
      if (!mounted) return timer.cancel();
      try {
        final job = await _api.status(id);
        if (!mounted) return timer.cancel();
        setState(() => _job = job);
        if (!job.running) timer.cancel();
      } on AudioError catch (error) {
        timer.cancel();
        if (!mounted) return;
        setState(() {
          _error = error.message;
          if (error.gone) _job = null;
        });
      }
    });
  }

  Future<void> _download() async {
    final job = _job;
    if (job == null || _busy) return;

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      // Fetched rather than linked: a plain anchor cannot carry the bearer
      // token, and the result is not public.
      final bytes = await _api.download(job.id);
      final note = await deliverFile(
        bytes: bytes,
        fileName: job.resultName,
        mimeType: _limits?.formatById(job.format) == null
            ? 'application/octet-stream'
            : _mimeFor(job.format),
      );
      if (note != null && mounted) _showToast(note);
    } on AudioError catch (error) {
      if (mounted) {
        setState(() {
          _error = error.message;
          if (error.gone) _job = null;
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Only used for the share sheet on native builds; the browser reads the
  /// server's own Content-Type on the download instead.
  String _mimeFor(String format) => switch (format) {
        'mp3' => 'audio/mpeg',
        'wav' => 'audio/wav',
        'flac' => 'audio/flac',
        'm4a' => 'audio/mp4',
        'ogg' => 'audio/ogg',
        'opus' => 'audio/opus',
        _ => 'application/octet-stream',
      };

  Future<void> _cancel() async {
    final job = _job;
    if (job == null) return;

    _poll?.cancel();
    try {
      await _api.cancel(job.id);
      if (mounted) setState(() => _job = null);
    } on AudioError catch (error) {
      if (mounted) setState(() => _error = error.message);
    }
  }

  void _showToast(String message) {
    _toastTimer?.cancel();
    setState(() => _toast = message);
    _toastTimer = Timer(const Duration(seconds: 3), () {
      if (mounted) setState(() => _toast = '');
    });
  }

  // ---- build ----

  @override
  Widget build(BuildContext context) {
    final limits = _limits;
    final uploading = _uploaded != null;
    // While the upload runs there is no job yet, so the panel is fed a
    // placeholder carrying the one thing that is known: which file.
    final job = _job ??
        (uploading
            ? AudioJob(
                id: '',
                stage: 'uploading',
                sourceName: _fileName,
                format: _format,
                bitrate: _selected?.lossy ?? true ? _bitrate : 0,
              )
            : null);

    return AFScaffold(
      title: 'reAFresh · Audio',
      tagline: 'anything in, any format out',
      onBack: () => Navigator.of(context).maybePop(),
      footer: AFFooter(
        limits == null
            ? 'Conversion runs on a worker, not in this tab.'
            : 'Conversion runs on a worker, not in this tab · '
                'results are deleted after ${formatTtl(limits.resultTtl)}.',
      ),
      child: ListView(
        padding: const EdgeInsets.only(bottom: 8),
        children: [
          _sourcePanel(),
          if (job != null) ...[
            const SizedBox(height: 18),
            AudioJobPanel(
              job: job,
              busy: _busy,
              uploadFraction: _uploaded,
              onDownload: _download,
              onCancel: _cancel,
            ),
          ],
          if (_error != null) AFHint(_error!),
          if (_toast.isNotEmpty) AFHint(_toast, tip: true),
        ],
      ),
    );
  }

  Widget _sourcePanel() {
    final bytes = _bytes;
    final selected = _selected;

    return AFPanel(
      label: 'Source',
      count: bytes == null ? 'no file' : formatBytes(bytes.length),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AFField(
            label: 'File',
            value: bytes == null ? '—' : _fileName,
            topSpacing: 0,
            child: AFButton.ghost(
              label: bytes == null ? 'Choose a file' : 'Choose a different file',
              expand: true,
              icon: Icons.folder_open_outlined,
              onPressed: _busy ? null : _pick,
            ),
          ),
          AFField(
            label: 'Convert to',
            value: selected?.label ?? _format.toUpperCase(),
            child: _formatPicker(),
          ),
          if (selected != null && selected.note.isNotEmpty)
            AFHint(selected.note, tip: true),
          // Hidden rather than disabled for the lossless formats: a bitrate
          // control that changes nothing is worse than no control.
          if (_rates.isNotEmpty)
            AFField(
              label: 'Bitrate',
              value: '$_bitrate kbit/s',
              child: AFSegmented<int>(
                segments: [
                  for (final rate in _rates) AFSegment(value: rate, label: '$rate'),
                ],
                value: _bitrate,
                onChanged:
                    _busy ? (_) {} : (rate) => setState(() => _bitrate = rate),
              ),
            ),
          const SizedBox(height: 20),
          AFButton(
            label: _busy
                ? 'Working…'
                : 'Convert to ${selected?.label ?? _format.toUpperCase()}',
            expand: true,
            onPressed: bytes == null || _busy ? null : _convert,
          ),
        ],
      ),
    );
  }

  /// The format list, chunked into rows.
  ///
  /// Two stacked [AFSegmented]s sharing one value read as a single control:
  /// whichever row holds the selection lights up, and the other simply has
  /// nothing selected.
  Widget _formatPicker() {
    final formats = _limits?.formats ?? const <AudioFormat>[];
    if (formats.isEmpty) {
      return AFSegmented<String>(
        segments: [AFSegment(value: _format, label: _format.toUpperCase())],
        value: _format,
        onChanged: (_) {},
      );
    }

    final rows = <Widget>[];
    for (var start = 0; start < formats.length; start += _perRow) {
      final slice = formats.sublist(
        start,
        (start + _perRow).clamp(0, formats.length),
      );
      if (rows.isNotEmpty) rows.add(const SizedBox(height: 6));
      rows.add(
        AFSegmented<String>(
          segments: [
            for (final format in slice)
              AFSegment(value: format.id, label: format.label),
          ],
          value: _format,
          onChanged: _busy ? (_) {} : _chooseFormat,
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: rows,
    );
  }
}
