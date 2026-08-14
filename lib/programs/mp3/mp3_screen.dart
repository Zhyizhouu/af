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
import 'mp3_api.dart';
import 'mp3_job_panel.dart';

/// AF · MP3 — hand it a file, get an MP3 back.
///
/// Unlike every other program in AF this one is not local: the conversion runs
/// on a worker, orchestrated by Temporal, and this screen only uploads, polls
/// and downloads. That is why it is the one page that can say "not reachable".
class Mp3Screen extends StatefulWidget {
  /// Injectable so tests can drive the whole flow without a container running.
  final Mp3Api? api;

  const Mp3Screen({super.key, this.api});

  @override
  State<Mp3Screen> createState() => _Mp3ScreenState();
}

class _Mp3ScreenState extends State<Mp3Screen> {
  /// Fast enough that a short file does not look stuck, slow enough that a
  /// long one is not a thousand requests.
  static const _pollEvery = Duration(milliseconds: 1200);

  late final Mp3Api _api = widget.api ?? Mp3Api();

  Mp3Limits? _limits;
  int _bitrate = 192;

  Uint8List? _bytes;
  String _fileName = '';

  Mp3Job? _job;
  Timer? _poll;

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
        if (limits.bitrates.contains(limits.defaultBitrate)) {
          _bitrate = limits.defaultBitrate;
        }
      });
    } on Mp3Error catch (error) {
      // Not fatal on its own — the converter may simply be down. Saying so up
      // front beats letting somebody pick a 200MB file and find out after.
      if (mounted) setState(() => _error = error.message);
    }
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
    });

    try {
      final job = await _api.submit(
        bytes: bytes,
        fileName: _fileName,
        bitrate: _bitrate,
      );
      if (!mounted) return;
      setState(() => _job = job);
      _startPolling(job.id);
    } on Mp3Error catch (error) {
      if (mounted) setState(() => _error = error.message);
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
      } on Mp3Error catch (error) {
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
        mimeType: 'audio/mpeg',
      );
      if (note != null && mounted) _showToast(note);
    } on Mp3Error catch (error) {
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

  Future<void> _cancel() async {
    final job = _job;
    if (job == null) return;

    _poll?.cancel();
    try {
      await _api.cancel(job.id);
      if (mounted) setState(() => _job = null);
    } on Mp3Error catch (error) {
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
    final job = _job;
    final limits = _limits;

    return AFScaffold(
      title: 'AF · MP3',
      tagline: 'anything in, mp3 out',
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
            Mp3JobPanel(
              job: job,
              busy: _busy,
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
    final rates = _limits?.bitrates ?? const [128, 192, 256, 320];

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
            label: 'Bitrate',
            value: '$_bitrate kbit/s',
            child: AFSegmented<int>(
              segments: [
                for (final rate in rates) AFSegment(value: rate, label: '$rate'),
              ],
              value: _bitrate,
              onChanged:
                  _busy ? (_) {} : (rate) => setState(() => _bitrate = rate),
            ),
          ),
          const SizedBox(height: 20),
          AFButton(
            label: _busy ? 'Working…' : 'Convert to MP3',
            expand: true,
            onPressed: bytes == null || _busy ? null : _convert,
          ),
        ],
      ),
    );
  }
}
