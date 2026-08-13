import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/af_text.dart';
import '../theme/af_tokens.dart';

/// A recessed input with the QR Generator's focus treatment: the border turns
/// accent and a 3px accent-soft ring blooms around it.
class AFTextField extends StatefulWidget {
  final TextEditingController? controller;
  final String? hint;
  final int minLines;
  final int maxLines;

  /// Monospace by default — this look treats input as data, not prose. Set
  /// false for fields holding human sentences (checklist labels, course names).
  final bool mono;

  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final TextInputType? keyboardType;
  final TextCapitalization textCapitalization;
  final TextAlign textAlign;
  final List<TextInputFormatter>? inputFormatters;
  final int? maxLength;
  final bool autofocus;
  final bool enabled;
  final Widget? prefix;
  final Widget? suffix;
  final FocusNode? focusNode;

  const AFTextField({
    super.key,
    this.controller,
    this.hint,
    this.minLines = 1,
    this.maxLines = 1,
    this.mono = true,
    this.onChanged,
    this.onSubmitted,
    this.keyboardType,
    this.textCapitalization = TextCapitalization.none,
    this.textAlign = TextAlign.start,
    this.inputFormatters,
    this.maxLength,
    this.autofocus = false,
    this.enabled = true,
    this.prefix,
    this.suffix,
    this.focusNode,
  });

  @override
  State<AFTextField> createState() => _AFTextFieldState();
}

class _AFTextFieldState extends State<AFTextField> {
  late final FocusNode _focusNode = widget.focusNode ?? FocusNode();
  bool _ownsFocusNode = false;
  bool _focused = false;

  @override
  void initState() {
    super.initState();
    _ownsFocusNode = widget.focusNode == null;
    _focusNode.addListener(_onFocusChange);
  }

  void _onFocusChange() {
    if (_focused != _focusNode.hasFocus) {
      setState(() => _focused = _focusNode.hasFocus);
    }
  }

  @override
  void dispose() {
    _focusNode.removeListener(_onFocusChange);
    if (_ownsFocusNode) _focusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.af;

    final textStyle = widget.mono
        ? AFText.mono(size: 14, color: t.ink, height: 1.55)
        : AFText.body(context);

    return AnimatedContainer(
      duration: const Duration(milliseconds: 120),
      decoration: BoxDecoration(
        // The QR page brightens the fill on focus; mirror that.
        color: _focused ? t.panel : t.sunken,
        borderRadius: t.borderRadius,
        border: Border.all(color: _focused ? t.accent : t.lineStrong),
        boxShadow: _focused
            ? [BoxShadow(color: t.accentSoft, spreadRadius: 3, blurRadius: 0)]
            : null,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          if (widget.prefix != null)
            Padding(
              padding: const EdgeInsets.only(left: 8),
              child: widget.prefix,
            ),
          Expanded(
            child: TextField(
              controller: widget.controller,
              focusNode: _focusNode,
              enabled: widget.enabled,
              minLines: widget.minLines,
              maxLines: widget.maxLines,
              style: textStyle,
              textAlign: widget.textAlign,
              cursorColor: t.accent,
              cursorWidth: 1.5,
              keyboardType: widget.keyboardType,
              textCapitalization: widget.textCapitalization,
              inputFormatters: widget.inputFormatters,
              maxLength: widget.maxLength,
              autofocus: widget.autofocus,
              onChanged: widget.onChanged,
              onSubmitted: widget.onSubmitted,
              decoration: InputDecoration(
                isDense: true,
                counterText: '',
                filled: false,
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                disabledBorder: InputBorder.none,
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 13, vertical: 12),
                hintText: widget.hint,
                hintStyle: textStyle.copyWith(
                  color: t.muted.withValues(alpha: 0.75),
                ),
              ),
            ),
          ),
          if (widget.suffix != null)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: widget.suffix,
            ),
        ],
      ),
    );
  }
}
