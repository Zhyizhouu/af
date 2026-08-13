import 'package:flutter/material.dart';

import '../theme/af_tokens.dart';

/// A flat progress rule. No rounded caps, no animation flourish — it reads as
/// a gauge on an instrument rather than a Material progress bar.
class AFProgressBar extends StatelessWidget {
  /// 0..1. Values outside that range are clamped.
  final double value;

  final double height;

  /// Defaults to the accent; completed work switches to [AFTokens.ok].
  final Color? color;

  const AFProgressBar({
    super.key,
    required this.value,
    this.height = 4,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    final t = context.af;
    final fraction = value.isNaN ? 0.0 : value.clamp(0.0, 1.0);

    return ClipRRect(
      borderRadius: BorderRadius.circular(2),
      child: SizedBox(
        height: height,
        child: Stack(
          children: [
            Positioned.fill(child: ColoredBox(color: t.sunken)),
            FractionallySizedBox(
              widthFactor: fraction,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                color: color ?? (fraction >= 1 ? t.ok : t.accent),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
