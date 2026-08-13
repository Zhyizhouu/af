import 'package:flutter/material.dart';

import '../theme/af_text.dart';
import '../theme/af_tokens.dart';

enum AFButtonVariant {
  /// `.btn` — solid ink fill. The primary action.
  solid,

  /// `.btn.ghost` — panel fill with a strong hairline.
  ghost,

  /// Borderless, muted. For cancel and other low-stakes actions.
  quiet,

  /// Ghost with warn-coloured text and border.
  danger,
}

/// The QR Generator's `.btn`: monospace, 4px radius, and a 1px nudge downward
/// while held.
class AFButton extends StatefulWidget {
  final String label;
  final VoidCallback? onPressed;
  final AFButtonVariant variant;
  final IconData? icon;

  /// Stretch to the width of the parent.
  final bool expand;

  const AFButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.variant = AFButtonVariant.solid,
    this.icon,
    this.expand = false,
  });

  const AFButton.ghost({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.expand = false,
  }) : variant = AFButtonVariant.ghost;

  const AFButton.quiet({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.expand = false,
  }) : variant = AFButtonVariant.quiet;

  const AFButton.danger({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.expand = false,
  }) : variant = AFButtonVariant.danger;

  @override
  State<AFButton> createState() => _AFButtonState();
}

class _AFButtonState extends State<AFButton> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final t = context.af;
    final enabled = widget.onPressed != null;

    late final Color background;
    late final Color foreground;
    late final Color border;

    switch (widget.variant) {
      case AFButtonVariant.solid:
        background = t.ink;
        foreground = t.onInk;
        border = t.ink;
      case AFButtonVariant.ghost:
        background = t.panel;
        foreground = t.ink;
        border = t.lineStrong;
      case AFButtonVariant.quiet:
        background = Colors.transparent;
        foreground = t.muted;
        border = Colors.transparent;
      case AFButtonVariant.danger:
        background = t.panel;
        foreground = t.warn;
        border = t.warn;
    }

    Widget button = Opacity(
      opacity: enabled ? (_pressed ? 0.88 : 1) : 0.4,
      child: Transform.translate(
        offset: Offset(0, _pressed && enabled ? 1 : 0),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: background,
            borderRadius: t.borderRadius,
            border: Border.all(color: border),
          ),
          child: Row(
            mainAxisSize: widget.expand ? MainAxisSize.max : MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (widget.icon != null) ...[
                Icon(widget.icon, size: 15, color: foreground),
                const SizedBox(width: 7),
              ],
              Flexible(
                child: Text(
                  widget.label,
                  style: AFText.button(context, color: foreground),
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                ),
              ),
            ],
          ),
        ),
      ),
    );

    if (widget.expand) {
      button = SizedBox(width: double.infinity, child: button);
    }

    return Semantics(
      button: true,
      enabled: enabled,
      label: widget.label,
      child: GestureDetector(
        onTapDown: enabled ? (_) => setState(() => _pressed = true) : null,
        onTapUp: enabled ? (_) => setState(() => _pressed = false) : null,
        onTapCancel: enabled ? () => setState(() => _pressed = false) : null,
        onTap: widget.onPressed,
        child: MouseRegion(
          cursor: enabled ? SystemMouseCursors.click : SystemMouseCursors.forbidden,
          child: button,
        ),
      ),
    );
  }
}

/// A square hairline button holding a single icon — used in the masthead.
class AFIconButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onPressed;
  final String tooltip;
  final bool bordered;

  const AFIconButton({
    super.key,
    required this.icon,
    required this.onPressed,
    required this.tooltip,
    this.bordered = true,
  });

  @override
  Widget build(BuildContext context) {
    final t = context.af;
    return Tooltip(
      message: tooltip,
      child: Material(
        color: bordered ? t.panel : Colors.transparent,
        borderRadius: t.borderRadius,
        child: InkWell(
          onTap: onPressed,
          borderRadius: t.borderRadius,
          highlightColor: t.accentSoft,
          splashColor: t.accentSoft,
          child: Container(
            width: 32,
            height: 32,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              borderRadius: t.borderRadius,
              border: bordered ? Border.all(color: t.lineStrong) : null,
            ),
            child: Icon(icon, size: 16, color: t.ink),
          ),
        ),
      ),
    );
  }
}
