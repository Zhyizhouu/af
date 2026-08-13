import 'package:flutter/material.dart';

import '../theme/af_text.dart';
import '../theme/af_tokens.dart';

/// A labelled control: `.field` + `.field-head` from the QR Generator.
///
/// The label sits left, a live read-out sits right, and the control goes
/// underneath. That read-out is the small habit that makes the original feel
/// like an instrument rather than a form, so most fields should supply one.
class AFField extends StatelessWidget {
  final String label;
  final String? value;
  final Widget? valueWidget;
  final Widget child;

  /// Vertical space above the field. The QR page uses 20px between fields.
  final double topSpacing;

  const AFField({
    super.key,
    required this.label,
    this.value,
    this.valueWidget,
    required this.child,
    this.topSpacing = 20,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(top: topSpacing),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Flexible(
                child: Text(
                  label,
                  style: AFText.fieldLabel(context),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 12),
              if (valueWidget != null)
                Flexible(child: valueWidget!)
              else if (value != null)
                Flexible(
                  child: Text(
                    value!,
                    style: AFText.fieldValue(context),
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.right,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 8),
          child,
        ],
      ),
    );
  }
}

/// Small monospace note under a field. `.hint` / `.hint.tip`.
class AFHint extends StatelessWidget {
  final String text;

  /// Renders in the accent colour, for advice rather than description.
  final bool tip;

  const AFHint(this.text, {super.key, this.tip = false});

  @override
  Widget build(BuildContext context) {
    if (text.isEmpty) return const SizedBox.shrink();
    final t = context.af;
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Text(
        text,
        style: AFText.meta(context, color: tip ? t.accent : t.muted),
      ),
    );
  }
}

/// A status line with a leading dot — `.contrast` in the QR Generator.
class AFStatusLine extends StatelessWidget {
  final String text;
  final Color color;

  const AFStatusLine({super.key, required this.text, required this.color});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            margin: const EdgeInsets.only(top: 5),
            width: 7,
            height: 7,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 7),
          Expanded(
            child: Text(text, style: AFText.meta(context, color: color)),
          ),
        ],
      ),
    );
  }
}
