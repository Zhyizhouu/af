import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../theme/af_text.dart';
import '../../theme/af_tokens.dart';
import '../../widgets/af_button.dart';
import 'qr_render.dart';

/// The QR Generator's `.swatch-row`: a colour chip beside an editable hex
/// field, both inside one hairline box.
///
/// Tapping the chip opens a small palette. Flutter has no native colour input
/// and this program only ever needs flat, scannable colours, so a curated set
/// plus the hex field covers it without pulling in a picker package.
class QrColorField extends StatefulWidget {
  final Color value;
  final ValueChanged<Color> onChanged;
  final String semanticLabel;

  const QrColorField({
    super.key,
    required this.value,
    required this.onChanged,
    required this.semanticLabel,
  });

  @override
  State<QrColorField> createState() => _QrColorFieldState();
}

class _QrColorFieldState extends State<QrColorField> {
  late final TextEditingController _controller =
      TextEditingController(text: toHex(widget.value));
  final FocusNode _focusNode = FocusNode();

  @override
  void initState() {
    super.initState();
    // Snap a partially-typed hex back to the committed value on blur, so the
    // field never sits showing something that was never applied.
    _focusNode.addListener(() {
      if (!_focusNode.hasFocus) _syncText();
    });
  }

  @override
  void didUpdateWidget(covariant QrColorField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.value != widget.value && !_focusNode.hasFocus) _syncText();
  }

  void _syncText() {
    final hex = toHex(widget.value);
    if (_controller.text.toUpperCase() != hex) _controller.text = hex;
  }

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  Future<void> _openPalette() async {
    final picked = await showDialog<Color>(
      context: context,
      builder: (_) => _PaletteDialog(current: widget.value),
    );
    if (picked != null) {
      widget.onChanged(picked);
      _controller.text = toHex(picked);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.af;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: t.sunken,
        borderRadius: t.borderRadius,
        border: Border.all(color: t.lineStrong),
      ),
      child: Row(
        children: [
          Semantics(
            button: true,
            label: '${widget.semanticLabel} swatch',
            child: GestureDetector(
              onTap: _openPalette,
              child: Container(
                width: 26,
                height: 26,
                decoration: BoxDecoration(
                  color: widget.value,
                  borderRadius: BorderRadius.circular(3),
                  border: Border.all(color: t.lineStrong),
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: TextField(
              controller: _controller,
              focusNode: _focusNode,
              maxLength: 7,
              cursorColor: t.accent,
              cursorWidth: 1.5,
              style: AFText.mono(size: 13, color: t.ink),
              textCapitalization: TextCapitalization.characters,
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp(r'[#0-9a-fA-F]')),
                TextInputFormatter.withFunction(
                  (_, next) => next.copyWith(text: next.text.toUpperCase()),
                ),
              ],
              decoration: const InputDecoration(
                isDense: true,
                counterText: '',
                filled: false,
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                contentPadding: EdgeInsets.zero,
              ),
              onChanged: (raw) {
                final parsed = parseHex(raw);
                if (parsed != null) widget.onChanged(parsed);
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _PaletteDialog extends StatelessWidget {
  final Color current;

  const _PaletteDialog({required this.current});

  /// Flat, high-contrast colours only — gradients and pastels do not scan.
  static const List<Color> _swatches = [
    Color(0xFF101319),
    Color(0xFF000000),
    Color(0xFF14161B),
    Color(0xFF1B2430),
    Color(0xFF3B49FF),
    Color(0xFF0B3D91),
    Color(0xFF14532D),
    Color(0xFF7F1D1D),
    Color(0xFF78350F),
    Color(0xFF4C1D95),
    Color(0xFF767C86),
    Color(0xFFC9CDD4),
    Color(0xFFE7E9ED),
    Color(0xFFF4F5F7),
    Color(0xFFFBFBFC),
    Color(0xFFFFFFFF),
  ];

  @override
  Widget build(BuildContext context) {
    final t = context.af;

    return AlertDialog(
      title: const Text('PICK A COLOUR'),
      contentPadding: const EdgeInsets.fromLTRB(24, 8, 24, 0),
      content: SizedBox(
        width: 300,
        child: GridView.count(
          shrinkWrap: true,
          crossAxisCount: 8,
          mainAxisSpacing: 6,
          crossAxisSpacing: 6,
          children: [
            for (final swatch in _swatches)
              GestureDetector(
                onTap: () => Navigator.of(context).pop(swatch),
                child: Container(
                  decoration: BoxDecoration(
                    color: swatch,
                    borderRadius: BorderRadius.circular(2),
                    border: Border.all(
                      color: swatch == current ? t.accent : t.lineStrong,
                      width: swatch == current ? 2 : 1,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
      actions: [
        AFButton.quiet(
          label: 'Cancel',
          onPressed: () => Navigator.of(context).pop(),
        ),
      ],
    );
  }
}
