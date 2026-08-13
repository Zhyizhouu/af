import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../../theme/af_tokens.dart';
import '../../widgets/af_scaffold.dart';

/// The preview stage — the signature element of the QR Generator.
///
/// Graph-paper ground, four accent reticle brackets, and a scan line that
/// sweeps once each time a new code is produced. Bump [revision] to re-run
/// that sweep.
class QrViewport extends StatefulWidget {
  final ui.Image? image;

  /// Shown in place of the code when encoding failed.
  final String? error;

  /// Shown when there is nothing to encode yet.
  final String emptyMessage;

  /// Any change re-triggers the scan sweep.
  final int revision;

  const QrViewport({
    super.key,
    required this.image,
    required this.error,
    required this.emptyMessage,
    required this.revision,
  });

  @override
  State<QrViewport> createState() => _QrViewportState();
}

class _QrViewportState extends State<QrViewport>
    with SingleTickerProviderStateMixin {
  late final AnimationController _sweep = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 700),
  );

  @override
  void didUpdateWidget(covariant QrViewport oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.revision != oldWidget.revision && widget.image != null) {
      if (!_reduceMotion) _sweep.forward(from: 0);
    }
  }

  bool get _reduceMotion => MediaQuery.maybeDisableAnimationsOf(context) ?? false;

  @override
  void dispose() {
    _sweep.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.af;

    return AspectRatio(
      aspectRatio: 1,
      child: Container(
        decoration: BoxDecoration(
          color: t.sunken,
          borderRadius: t.borderRadius,
          border: Border.all(color: t.line),
        ),
        clipBehavior: Clip.antiAlias,
        child: LayoutBuilder(
          builder: (context, constraints) {
            return Stack(
              children: [
                Positioned.fill(
                  child: CustomPaint(painter: _GraphPaperPainter(t.line)),
                ),
                Positioned.fill(
                  child: Padding(
                    padding: const EdgeInsets.all(34),
                    child: Center(child: _content(context)),
                  ),
                ),
                ..._brackets(t.accent),
                _scanLine(constraints.maxHeight, t.accent),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _content(BuildContext context) {
    final t = context.af;

    if (widget.error != null) {
      return AFEmptyState(
        glyph: '',
        message: widget.error!,
        color: t.warn,
      );
    }
    if (widget.image == null) {
      return AFEmptyState(message: widget.emptyMessage);
    }

    return DecoratedBox(
      decoration: BoxDecoration(
        boxShadow: [
          BoxShadow(
            color: t.ink.withValues(alpha: 0.06),
            offset: const Offset(0, 1),
          ),
        ],
      ),
      // FilterQuality.none keeps modules hard-edged when the code is scaled
      // down to fit — the equivalent of `image-rendering: pixelated`.
      child: RawImage(
        image: widget.image,
        fit: BoxFit.contain,
        filterQuality: FilterQuality.none,
        isAntiAlias: false,
      ),
    );
  }

  List<Widget> _brackets(Color accent) {
    return [
      Positioned(top: 12, left: 12, child: _Bracket(accent, top: true, left: true)),
      Positioned(top: 12, right: 12, child: _Bracket(accent, top: true, left: false)),
      Positioned(bottom: 12, left: 12, child: _Bracket(accent, top: false, left: true)),
      Positioned(bottom: 12, right: 12, child: _Bracket(accent, top: false, left: false)),
    ];
  }

  Widget _scanLine(double height, Color accent) {
    return AnimatedBuilder(
      animation: _sweep,
      builder: (context, _) {
        if (!_sweep.isAnimating) return const SizedBox.shrink();

        final v = _sweep.value;
        final opacity = v < 0.12
            ? v / 0.12
            : v > 0.88
                ? (1 - v) / 0.12
                : 1.0;

        return Positioned(
          left: 12,
          right: 12,
          top: 12 + v * (height - 26),
          child: Opacity(
            opacity: opacity.clamp(0.0, 1.0),
            child: Container(
              height: 2,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    accent.withValues(alpha: 0),
                    accent,
                    accent.withValues(alpha: 0),
                  ],
                ),
                boxShadow: [
                  BoxShadow(color: accent, blurRadius: 8, spreadRadius: 1),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class _Bracket extends StatelessWidget {
  final Color color;
  final bool top;
  final bool left;

  const _Bracket(this.color, {required this.top, required this.left});

  @override
  Widget build(BuildContext context) {
    const side = BorderSide.none;
    final accent = BorderSide(color: color, width: 2.5);

    return SizedBox(
      width: 26,
      height: 26,
      child: DecoratedBox(
        decoration: BoxDecoration(
          border: Border(
            top: top ? accent : side,
            bottom: top ? side : accent,
            left: left ? accent : side,
            right: left ? side : accent,
          ),
        ),
      ),
    );
  }
}

class _GraphPaperPainter extends CustomPainter {
  final Color line;

  const _GraphPaperPainter(this.line);

  static const double _step = 22;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = line
      ..strokeWidth = 1
      ..isAntiAlias = false;

    for (var x = 0.0; x <= size.width; x += _step) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    }
    for (var y = 0.0; y <= size.height; y += _step) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    }
  }

  @override
  bool shouldRepaint(_GraphPaperPainter oldDelegate) => oldDelegate.line != line;
}
