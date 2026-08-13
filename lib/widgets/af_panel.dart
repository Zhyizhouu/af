import 'package:flutter/material.dart';

import '../theme/af_text.dart';
import '../theme/af_tokens.dart';

/// A bordered surface with an optional monospace caption bar.
///
/// This is `.panel` + `.panel-label` from the QR Generator: a hairline box on
/// the desk, captioned with an uppercase mono label on the left and a live
/// read-out ([count]) on the right.
class AFPanel extends StatelessWidget {
  /// Uppercased automatically — pass it in whatever case reads best in source.
  final String? label;

  /// The read-out at the right end of the label row ("0 chars", "12/34").
  final String? count;

  /// Use instead of [count] when the read-out needs its own styling.
  final Widget? countWidget;

  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry? margin;
  final VoidCallback? onTap;

  /// Draws the accent along the left edge — used to mark a live/selected panel.
  final bool accented;

  const AFPanel({
    super.key,
    this.label,
    this.count,
    this.countWidget,
    required this.child,
    this.padding = const EdgeInsets.all(20),
    this.margin,
    this.onTap,
    this.accented = false,
  });

  @override
  Widget build(BuildContext context) {
    final t = context.af;

    final content = Padding(
      padding: padding,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (label != null || countWidget != null || count != null) ...[
            AFPanelLabel(label: label ?? '', count: count, countWidget: countWidget),
            const SizedBox(height: 16),
          ],
          child,
        ],
      ),
    );

    Widget inner = content;

    if (onTap != null) {
      inner = Material(
        type: MaterialType.transparency,
        child: InkWell(
          onTap: onTap,
          borderRadius: t.borderRadius,
          highlightColor: t.accentSoft,
          splashColor: t.accentSoft,
          child: content,
        ),
      );
    }

    if (accented) {
      // Drawn as a strip rather than a thicker left BorderSide: Flutter
      // asserts that a bordered box with a borderRadius has uniform sides.
      inner = Stack(
        children: [
          inner,
          PositionedDirectional(
            start: 0,
            top: 0,
            bottom: 0,
            width: 2,
            child: ColoredBox(color: t.accent),
          ),
        ],
      );
    }

    return Container(
      margin: margin,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: t.panel,
        borderRadius: t.borderRadius,
        border: Border.all(color: t.line),
      ),
      child: inner,
    );
  }
}

/// The caption row on its own, for places that need it outside an [AFPanel].
class AFPanelLabel extends StatelessWidget {
  final String label;
  final String? count;
  final Widget? countWidget;

  const AFPanelLabel({
    super.key,
    required this.label,
    this.count,
    this.countWidget,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: Text(
            label.toUpperCase(),
            style: AFText.panelLabel(context),
            overflow: TextOverflow.ellipsis,
          ),
        ),
        if (countWidget != null)
          countWidget!
        else if (count != null)
          Text(count!, style: AFText.panelCount(context)),
      ],
    );
  }
}
