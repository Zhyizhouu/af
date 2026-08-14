import 'package:flutter/material.dart';

import '../theme/af_text.dart';
import '../theme/af_tokens.dart';

/// One step of a job, and what it is actually doing.
///
/// The explanation is not decoration. These jobs move between machines — a
/// browser, a gateway, an object store, a worker, sometimes an API in another
/// country — and a bar creeping along tells somebody nothing about why a
/// two-minute wait is reasonable. Naming the step does.
class AFPhase {
  /// Matches the `step` or `stage` the server reports.
  final String id;

  /// Two or three words, shown as the heading.
  final String label;

  /// One sentence, in the present tense, saying what is happening and where.
  final String explanation;

  const AFPhase({
    required this.id,
    required this.label,
    required this.explanation,
  });
}

/// A segmented progress bar: one cell per phase, filled as the job advances.
///
/// Segmented rather than a single bar because these jobs are not one
/// continuous piece of work. A single bar that jumps from 30% to 80% and then
/// sits still looks broken; a row of cells showing *which* step is running
/// makes the same behaviour legible.
class AFPhaseProgress extends StatelessWidget {
  final List<AFPhase> phases;

  /// The phase currently running. An id not in [phases] shows everything as
  /// pending, which is the honest rendering of a state we do not recognise.
  final String activeId;

  /// How far through the active phase, or null when the step reports nothing
  /// — the cell then shows as underway rather than pretending to a number.
  final double? phaseFraction;

  /// Stops the bar where it is and colours it as a fault.
  final bool failed;

  /// Shown in place of the active phase's explanation.
  final String? message;

  /// Marks every phase complete regardless of [activeId].
  final bool done;

  /// Replaces the heading for a state that is not one of the phases —
  /// "Expired" being the case that matters, since a job whose files have been
  /// deleted is neither working nor done and saying either would be a lie.
  final String? heading;

  const AFPhaseProgress({
    super.key,
    required this.phases,
    required this.activeId,
    this.phaseFraction,
    this.failed = false,
    this.message,
    this.done = false,
    this.heading,
  });

  int get _activeIndex => phases.indexWhere((p) => p.id == activeId);

  @override
  Widget build(BuildContext context) {
    final t = context.af;
    final active = _activeIndex;
    final colour = failed ? t.warn : (done ? t.ok : t.accent);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            for (var i = 0; i < phases.length; i++) ...[
              if (i > 0) const SizedBox(width: 3),
              Expanded(
                child: _Cell(
                  fill: done
                      ? 1
                      : i < active
                          ? 1
                          : i == active
                              ? (phaseFraction ?? 0)
                              : 0,
                  // The active cell is marked even at zero fill, so a step
                  // that reports no number still shows where the job is.
                  active: !done && i == active,
                  colour: colour,
                ),
              ),
            ],
          ],
        ),
        const SizedBox(height: 12),
        _Explanation(
          heading: heading ??
              (failed
                  ? 'Failed'
                  : done
                      ? 'Done'
                      : active >= 0
                          ? phases[active].label
                          : 'Working'),
          body: message ??
              (done
                  ? 'The file is ready to download.'
                  : active >= 0
                      ? phases[active].explanation
                      : 'Waiting for the converter to report in.'),
          step: active >= 0 && !done ? '${active + 1}/${phases.length}' : null,
          colour: colour,
          muted: t.muted,
        ),
      ],
    );
  }
}

class _Cell extends StatelessWidget {
  final double fill;
  final bool active;
  final Color colour;

  const _Cell({required this.fill, required this.active, required this.colour});

  @override
  Widget build(BuildContext context) {
    final t = context.af;

    return ClipRRect(
      borderRadius: BorderRadius.circular(2),
      child: SizedBox(
        height: 5,
        child: Stack(
          children: [
            Positioned.fill(
              child: ColoredBox(
                // A hairline tint on the running cell, so an active step with
                // nothing to report still reads as the live one.
                color: active ? colour.withValues(alpha: 0.22) : t.sunken,
              ),
            ),
            FractionallySizedBox(
              widthFactor: fill.clamp(0.0, 1.0),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 220),
                color: colour,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Explanation extends StatelessWidget {
  final String heading;
  final String body;
  final String? step;
  final Color colour;
  final Color muted;

  const _Explanation({
    required this.heading,
    required this.body,
    required this.step,
    required this.colour,
    required this.muted,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              width: 7,
              height: 7,
              margin: const EdgeInsets.only(right: 8),
              decoration: BoxDecoration(color: colour, shape: BoxShape.circle),
            ),
            Expanded(
              child: Text(
                heading,
                style: AFText.mono(
                  size: 12.5,
                  color: colour,
                  weight: FontWeight.w700,
                  letterSpacing: 0.3,
                ),
              ),
            ),
            if (step != null)
              Text(step!, style: AFText.mono(size: 11, color: muted)),
          ],
        ),
        const SizedBox(height: 6),
        Padding(
          padding: const EdgeInsets.only(left: 15),
          child: Text(
            body,
            // Sans, not mono: this is the one place in the design that carries
            // a sentence of human prose rather than machinery.
            style: AFText.body(context, color: muted),
          ),
        ),
      ],
    );
  }
}
