import 'package:flutter/material.dart';

import '../../theme/af_text.dart';
import '../../theme/af_tokens.dart';
import '../../widgets/af_button.dart';
import '../../widgets/af_field.dart';
import '../../widgets/af_panel.dart';
import '../../widgets/af_progress.dart';
import 'audio_api.dart';

/// One conversion, as a panel.
///
/// Split out from the screen because this is the part with five states —
/// queued, working, ready, expired, failed — and each of them has to survive a
/// long filename on a 390px phone.
class AudioJobPanel extends StatelessWidget {
  final AudioJob job;
  final bool busy;
  final VoidCallback? onDownload;
  final VoidCallback? onCancel;

  const AudioJobPanel({
    super.key,
    required this.job,
    this.busy = false,
    this.onDownload,
    this.onCancel,
  });

  @override
  Widget build(BuildContext context) {
    final t = context.af;
    final (String line, Color colour) = switch (job.stage) {
      'queued' => ('Queued — waiting for a free worker', t.muted),
      'transcoding' => (_workingLine(), t.accent),
      'ready' => ('Ready — ${formatBytes(job.sizeBytes)}', t.ok),
      'expired' => ('Expired — convert it again', t.muted),
      'failed' => (job.error ?? 'Conversion failed', t.warn),
      _ => (job.stage, t.muted),
    };

    return AFPanel(
      label: 'Conversion',
      count: job.seconds > 0 ? formatClock(job.seconds) : null,
      accented: job.running,
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
          if (job.downloadable || job.running) ...[
            const SizedBox(height: 18),
            if (job.downloadable)
              AFButton(
                label: busy ? 'Fetching…' : 'Download ${job.resultName}',
                expand: true,
                icon: Icons.download_outlined,
                onPressed: busy ? null : onDownload,
              )
            else
              AFButton.danger(
                label: 'Cancel',
                expand: true,
                onPressed: onCancel,
              ),
          ],
        ],
      ),
    );
  }

  String _workingLine() {
    final percent = (job.percent * 100).round();
    final target = job.format.toUpperCase();
    return switch (job.step) {
      'fetching' => 'Reading the upload — $percent%',
      'storing' => 'Storing the result',
      // Bitrate only means something for the lossy formats; showing "WAV at
      // 192 kbit/s" would describe a setting that was never applied.
      'encoding' when job.bitrate > 0 =>
        'Encoding $target at ${job.bitrate} kbit/s — $percent%',
      'encoding' => 'Encoding $target — $percent%',
      // No heartbeat has landed yet: the activity is scheduled, not started.
      _ => 'Starting up',
    };
  }
}

String formatBytes(int bytes) {
  if (bytes <= 0) return '—';
  if (bytes < 1024 * 1024) return '${(bytes / 1024).round()} KB';
  return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
}

String formatClock(double seconds) {
  final total = seconds.round();
  return '${total ~/ 60}:${(total % 60).toString().padLeft(2, '0')}';
}

String formatTtl(Duration ttl) {
  if (ttl.inHours >= 1) {
    return ttl.inHours == 1 ? 'an hour' : '${ttl.inHours} hours';
  }
  return '${ttl.inMinutes} minutes';
}
