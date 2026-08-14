import 'dart:async';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../../app/file_delivery.dart';
import '../../theme/af_text.dart';
import '../../theme/af_tokens.dart';
import '../../widgets/af_button.dart';
import '../../widgets/af_field.dart';
import '../../widgets/af_panel.dart';
import '../../widgets/af_progress.dart';
import '../../widgets/af_scaffold.dart';
import '../../widgets/af_segmented.dart';
import '../audio/audio_job_panel.dart' show formatBytes, formatTtl;
import 'caption_api.dart';
import 'caption_editor.dart';

/// AF · Captions — transcribe a video, fix the timings, write them back in.
///
/// The one program in AF that stops half way and waits for a person. That
/// pause is not a limitation to work around: timings from a model are close
/// rather than exact, and a caption that is close is a caption that is wrong.
class CaptionsScreen extends StatefulWidget {
  final CaptionApi? api;

  const CaptionsScreen({super.key, this.api});

  @override
  State<CaptionsScreen> createState() => _CaptionsScreenState();
}

class _CaptionsScreenState extends State<CaptionsScreen> {
  static const _pollEvery = Duration(milliseconds: 1500);

  late final CaptionApi _api = widget.api ?? CaptionApi();

  CaptionLimits? _limits;
  String _language = '';

  Uint8List? _bytes;
  String _fileName = '';

  CaptionJob? _job;
  CaptionTranscript? _transcript;
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
    if (widget.api == null) _api.close();
    super.dispose();
  }

  Future<void> _loadLimits() async {
    try {
      final limits = await _api.limits();
      if (!mounted) return;
      setState(() => _limits = limits);
    } on CaptionError catch (error) {
      if (mounted) setState(() => _error = error.message);
    }
  }

  // ---- actions ----

  Future<void> _pick() async {
    final result = await FilePicker.platform.pickFiles(
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
      _transcript = null;
    });
  }

  Future<void> _submit() async {
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
        language: _language,
      );
      if (!mounted) return;
      setState(() => _job = job);
      _startPolling(job.id);
    } on CaptionError catch (error) {
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

        // The transcript is fetched once, the moment the job parks. Polling
        // for it would re-send a two-hour lecture's worth of text every
        // second while somebody reads it.
        if (job.reviewing && _transcript == null) {
          await _loadTranscript(id);
        }
        if (!job.working && !job.reviewing) timer.cancel();
      } on CaptionError catch (error) {
        timer.cancel();
        if (!mounted) return;
        setState(() {
          _error = error.message;
          if (error.gone) _job = null;
        });
      }
    });
  }

  Future<void> _loadTranscript(String id) async {
    try {
      final transcript = await _api.transcript(id);
      if (mounted) setState(() => _transcript = transcript);
    } on CaptionError catch (error) {
      if (mounted) setState(() => _error = error.message);
    }
  }

  Future<void> _approve(List<CaptionSegment> segments) async {
    final job = _job;
    if (job == null || _busy) return;

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      await _api.approve(job.id, segments);
      if (!mounted) return;
      // The workflow moves to muxing the moment the signal lands; polling is
      // what notices, so nothing is set optimistically here.
      _startPolling(job.id);
    } on CaptionError catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _download(String artefact, String fileName, String mime) async {
    final job = _job;
    if (job == null || _busy) return;

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      final bytes = await _api.download(job.id, artefact);
      final note = await deliverFile(
        bytes: bytes,
        fileName: fileName,
        mimeType: mime,
      );
      if (note != null && mounted) _showToast(note);
    } on CaptionError catch (error) {
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
      if (mounted) {
        setState(() {
          _job = null;
          _transcript = null;
        });
      }
    } on CaptionError catch (error) {
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
    final transcript = _transcript;

    return AFScaffold(
      title: 'AF · Captions',
      tagline: 'transcribe, retime, write back in',
      onBack: () => Navigator.of(context).maybePop(),
      maxWidth: AFScaffold.maxWideWidth,
      footer: AFFooter(
        limits == null
            ? 'Transcription runs on a worker, not in this tab.'
            : 'Transcription runs on a worker, not in this tab · '
                'results are deleted after ${formatTtl(limits.resultTtl)}.',
      ),
      child: ListView(
        padding: const EdgeInsets.only(bottom: 8),
        children: [
          if (limits != null && !limits.configured) ...[
            _unconfigured(),
            const SizedBox(height: 18),
          ],
          if (job == null || job.failed) _sourcePanel(),
          if (job != null) ...[
            const SizedBox(height: 18),
            if (job.reviewing && transcript != null)
              CaptionEditor(
                transcript: transcript,
                reviewSeconds: job.reviewSeconds,
                busy: _busy,
                onApprove: _approve,
                onCancel: _cancel,
              )
            else
              _statusPanel(job),
          ],
          if (_error != null) AFHint(_error!),
          if (_toast.isNotEmpty) AFHint(_toast, tip: true),
        ],
      ),
    );
  }

  Widget _unconfigured() {
    final t = context.af;
    return AFPanel(
      label: 'Not configured',
      child: Text(
        'This server has no Gemini API key, so it cannot transcribe. '
        'Set AF_GEMINI_API_KEY on the worker and restart it.',
        style: AFText.mono(size: 12.5, color: t.warn, height: 1.6),
      ),
    );
  }

  Widget _sourcePanel() {
    final bytes = _bytes;
    final languages = _limits?.languages ?? const <CaptionLanguage>[];
    final configured = _limits?.configured ?? true;

    return AFPanel(
      label: 'Video',
      count: bytes == null ? 'no file' : formatBytes(bytes.length),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AFField(
            label: 'File',
            value: bytes == null ? '—' : _fileName,
            topSpacing: 0,
            child: AFButton.ghost(
              label: bytes == null ? 'Choose a video' : 'Choose a different video',
              expand: true,
              icon: Icons.folder_open_outlined,
              onPressed: _busy ? null : _pick,
            ),
          ),
          if (languages.isNotEmpty)
            AFField(
              label: 'Spoken language',
              value: languages
                  .firstWhere(
                    (l) => l.id == _language,
                    orElse: () => const CaptionLanguage(id: '', label: 'Detect'),
                  )
                  .label,
              child: _languagePicker(languages),
            ),
          const SizedBox(height: 20),
          AFButton(
            label: _busy ? 'Uploading…' : 'Transcribe',
            expand: true,
            onPressed: bytes == null || _busy || !configured ? null : _submit,
          ),
        ],
      ),
    );
  }

  /// Two rows, for the same reason the audio converter's format picker has
  /// two: six cells across is unreadable at 390px.
  Widget _languagePicker(List<CaptionLanguage> languages) {
    const perRow = 3;
    final rows = <Widget>[];

    for (var start = 0; start < languages.length; start += perRow) {
      final slice = languages.sublist(
        start,
        (start + perRow).clamp(0, languages.length),
      );
      if (rows.isNotEmpty) rows.add(const SizedBox(height: 6));
      rows.add(
        AFSegmented<String>(
          segments: [
            for (final language in slice)
              AFSegment(value: language.id, label: language.label),
          ],
          value: _language,
          onChanged:
              _busy ? (_) {} : (id) => setState(() => _language = id),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: rows,
    );
  }

  Widget _statusPanel(CaptionJob job) {
    final t = context.af;

    final (String line, Color colour) = switch (job.stage) {
      'queued' => ('Queued — waiting for a free worker', t.muted),
      'transcribing' => (_workingLine(job), t.accent),
      'review' => ('Loading the transcript…', t.accent),
      'muxing' => ('Writing the caption track', t.accent),
      'ready' => ('Ready — ${job.segments} captions, '
          '${formatBytes(job.sizeBytes)}', t.ok),
      'expired' => ('Expired — caption it again', t.muted),
      'failed' => (job.error ?? 'Captioning failed', t.warn),
      _ => (job.stage, t.muted),
    };

    return AFPanel(
      label: 'Job',
      count: job.seconds > 0 ? '${(job.seconds / 60).round()} min' : null,
      accented: job.working,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            job.sourceName,
            style: AFText.mono(size: 13, color: t.ink, weight: FontWeight.w600),
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 12),
          AFProgressBar(value: job.percent, color: job.failed ? t.warn : null),
          AFStatusLine(text: line, color: colour),
          if (job.downloadable) ...[
            const SizedBox(height: 18),
            AFButton(
              label: _busy ? 'Fetching…' : 'Download ${job.videoName}',
              expand: true,
              icon: Icons.download_outlined,
              onPressed: _busy
                  ? null
                  : () => _download('video', job.videoName, 'video/mp4'),
            ),
            const SizedBox(height: 10),
            // The sidecar is what actually imports into a Premiere timeline as
            // an editable caption track; the muxed MP4's own track is not.
            AFButton.ghost(
              label: 'Download ${job.subtitleName}',
              expand: true,
              icon: Icons.subtitles_outlined,
              onPressed: _busy
                  ? null
                  : () => _download(
                        'subtitles',
                        job.subtitleName,
                        'application/x-subrip',
                      ),
            ),
          ] else if (job.working) ...[
            const SizedBox(height: 18),
            AFButton.danger(
              label: 'Cancel',
              expand: true,
              onPressed: _cancel,
            ),
          ],
        ],
      ),
    );
  }

  String _workingLine(CaptionJob job) {
    final percent = (job.percent * 100).round();
    return switch (job.step) {
      'fetching' => 'Reading the upload — $percent%',
      'extracting' => 'Pulling the audio out',
      'transcribing' => 'Transcribing — $percent%',
      'muxing' => 'Writing the caption track',
      'storing' => 'Storing the result',
      _ => 'Starting up',
    };
  }
}
