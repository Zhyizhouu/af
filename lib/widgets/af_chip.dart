import 'package:flutter/material.dart';

import '../theme/af_text.dart';
import '../theme/af_tokens.dart';

/// A tiny uppercase mono tag on a soft tinted ground. Used for statuses
/// (READY / SOON / ARCHIVED) and for the session type badge.
class AFChip extends StatelessWidget {
  final String label;

  /// The tag's colour. Its 10-14% tint becomes the background.
  final Color color;

  /// Fill solidly with [color] and invert the text instead of tinting.
  final bool solid;

  const AFChip({
    super.key,
    required this.label,
    required this.color,
    this.solid = false,
  });

  @override
  Widget build(BuildContext context) {
    final t = context.af;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
      decoration: BoxDecoration(
        color: solid ? color : color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(2),
        border: Border.all(color: color.withValues(alpha: solid ? 1 : 0.35)),
      ),
      child: Text(
        label.toUpperCase(),
        style: AFText.mono(
          size: 10,
          color: solid ? t.panel : color,
          weight: FontWeight.w700,
          letterSpacing: 0.8,
        ),
      ),
    );
  }
}
