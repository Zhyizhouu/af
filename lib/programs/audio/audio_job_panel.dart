import 'package:flutter/material.dart';

import '../../theme/af_text.dart';
import '../../theme/af_tokens.dart';
import '../../widgets/af_button.dart';
import '../../widgets/af_panel.dart';
import '../../widgets/af_phase_progress.dart';
import 'audio_api.dart';

/// What a conversion goes through, and what each step is actually doing.
///
/// `uploading` is a client-side phase with no server equivalent — the job does
/// not exist until it finishes — but it belongs on the same bar, because from
/// where somebody is sitting it is the same wait.
const List<AFPhase> audioPhases = [
  AFPhase(
    id: 'uploading',
    label: 'Uploading',
    explanation:
        'Sending your file from this browser to the converter. Large files '
        'spend most of their time here.',
  ),
  AFPhase(
    id: 'queued',
    label: 'Queued',
    explanation:
        'The job is waiting for a free worker. With two workers running this '
        'is usually instant.',
  ),
  AFPhase(
    id: 'fetching',
    label: 'Reading',
    explanation:
        'A worker is pulling your file out of storage and onto its own disk, '
        'where ffmpeg can seek around in it.',
  ),
  AFPhase(
    id: 'encoding',
    label: 'Encoding',
    explanation:
        'ffmpeg is decoding the audio and re-encoding it in the format you '
        'chose. Video, if there was any, is discarded here.',
  ),
  AFPhase(
    id: 'storing',
    label: 'Storing',
    explanation:
        'Saving the finished file and deleting the one you uploaded, which is '
        'no longer needed.',
  ),
];

/// The phase id for a job, mapping the server's stage and step onto the bar.
String audioPhaseOf(AudioJob job) {
  if (job.stage == 'queued') return 'queued';
  if (job.stage != 'transcoding') return job.stage;
  // Before the first heartbeat lands the activity is scheduled but not
  // started, which is still the reading step from anybody's point of view.
  return job.step.isEmpty ? 'fetching' : job.step;
}

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

  /// Set while the file is still going up, with the fraction sent so far. The
  /// job does not exist server-side yet, so [job] is a placeholder.
  final double? uploadFraction;

  const AudioJobPanel({
    super.key,
    required this.job,
    this.busy = false,
    this.onDownload,
    this.onCancel,
    this.uploadFraction,
  });

  @override
  Widget build(BuildContext context) {
    final t = context.af;
    final uploading = uploadFraction != null;

    return AFPanel(
      label: 'Conversion',
      count: job.seconds > 0 ? formatClock(job.seconds) : null,
      accented: uploading || job.running,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            job.sourceName,
            style: AFText.mono(size: 13, color: t.ink, weight: FontWeight.w600),
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 14),
          AFPhaseProgress(
            phases: audioPhases,
            activeId: uploading ? 'uploading' : audioPhaseOf(job),
            phaseFraction: uploading ? uploadFraction : _fractionOf(job),
            failed: job.failed,
            done: job.stage == 'ready',
            heading: job.stage == 'expired' ? 'Expired' : null,
            message: _message(uploading),
          ),
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

  /// The server's percentage only means anything while a step is reporting
  /// one; a finished job is complete and a failed one stops where it was.
  double? _fractionOf(AudioJob job) {
    if (job.stage == 'ready') return 1;
    if (job.failed || job.stage == 'expired') return null;
    return job.percent > 0 ? job.percent : null;
  }

  /// Replaces the phase's stock explanation where the job knows something more
  /// specific — the settings actually in use, the size that came out, or why
  /// it stopped.
  String? _message(bool uploading) {
    if (uploading) return null;

    return switch (job.stage) {
      'failed' => job.error ?? 'The conversion failed.',
      'expired' =>
        'This result has been deleted. Convert the file again to get it back.',
      'ready' => 'Converted to ${job.format.toUpperCase()}'
          '${job.bitrate > 0 ? ' at ${job.bitrate} kbit/s' : ''}, '
          '${formatBytes(job.sizeBytes)}. Your uploaded file has been deleted.',
      // Bitrate only means something for the lossy formats; naming it for WAV
      // would describe a setting that was never applied to anything.
      'transcoding' when job.step == 'encoding' && job.bitrate > 0 =>
        'ffmpeg is encoding ${job.format.toUpperCase()} at '
            '${job.bitrate} kbit/s.',
      _ => null,
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
