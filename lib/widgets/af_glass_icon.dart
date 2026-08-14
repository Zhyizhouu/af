import 'dart:ui' as ui;

import 'package:flutter/material.dart';

/// The liquid-glass icon set, ported from the `Liquid Glass Icons` board in
/// Claude Design.
///
/// This is deliberately **outside** the AF design system. The in-app language
/// is flat, tokenised and nothing rounder than 4px; these are brand marks, and
/// a mark competes on a home screen and in a tile grid against other marks
/// rather than against AF's own chrome. Everything here is self-contained —
/// no AF token is read, so nothing leaks the other way.
///
/// Geometry is expressed against the board's 212px tile and scaled by [size],
/// so one widget serves a 32px favicon and a 1024px export alike.
enum AFGlassGlyph {
  af,
  checklists,
  calendar,
  habits,
  audio,
  ai,
  qr;

  /// The mark for an `AFProgram.id`, or null for a program without one.
  static AFGlassGlyph? forProgram(String id) => switch (id) {
        'checklists' => AFGlassGlyph.checklists,
        'calendar' => AFGlassGlyph.calendar,
        'habits' => AFGlassGlyph.habits,
        'audio' => AFGlassGlyph.audio,
        'ai' => AFGlassGlyph.ai,
        'qr' => AFGlassGlyph.qr,
        _ => null,
      };

  /// Fraction of the tile the artwork occupies, from the board's per-icon
  /// sizes (118px of text, 128/130/124px of SVG inside 212px).
  double get _extent => switch (this) {
        AFGlassGlyph.af => 118 / 212,
        AFGlassGlyph.checklists => 128 / 212,
        AFGlassGlyph.calendar => 130 / 212,
        AFGlassGlyph.habits => 126 / 212,
        AFGlassGlyph.audio => 126 / 212,
        AFGlassGlyph.ai => 128 / 212,
        AFGlassGlyph.qr => 124 / 212,
      };
}

/// One tile from the board: frosted pane, glowing mark, hover sheen.
class AFGlassIcon extends StatefulWidget {
  final AFGlassGlyph glyph;

  /// Edge length. The board draws at 212.
  final double size;

  /// `oklch(0.82 0.18 150)` — the mark's fill.
  final Color tint;

  /// `oklch(0.9 0.19 150)` — its stroke and glow.
  final Color tintBright;

  /// The plate the glass is poured onto, `#08090D` on the board.
  ///
  /// An icon owns its background the way a home-screen icon does — without
  /// this the white glass would simply tint whatever is behind it, which turns
  /// the tile into a grey smudge on AF's light desk. Pass `transparent` for
  /// true glass over rich content, and turn [frosted] on to go with it.
  final Color ground;

  /// Blurs whatever sits behind the tile, which is what makes the pane read as
  /// glass rather than as a grey box. Costs a saveLayer, and buys nothing
  /// behind an opaque [ground] — leave it off unless the plate is see-through.
  final bool frosted;

  /// The board's `sweep` keyframe: a highlight raked across on pointer enter.
  final bool hoverSheen;

  /// The board's hover state: a 6px lift on a deeper shadow.
  final bool hoverLift;

  const AFGlassIcon({
    super.key,
    required this.glyph,
    this.size = 212,
    this.tint = const Color(0xFF5CE483),
    this.tintBright = const Color(0xFF70FF98),
    this.ground = const Color(0xFF08090D),
    this.frosted = false,
    this.hoverSheen = true,
    this.hoverLift = true,
  });

  /// The board's tile is 212px with a 48px radius; every measurement below is
  /// a fraction of that so the whole thing scales as one piece.
  static const double _designSize = 212;

  double get _k => size / _designSize;

  @override
  State<AFGlassIcon> createState() => _AFGlassIconState();
}

class _AFGlassIconState extends State<AFGlassIcon>
    with SingleTickerProviderStateMixin {
  late final AnimationController _sheen = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  );

  bool _hovered = false;

  @override
  void dispose() {
    _sheen.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final k = widget._k;
    final radius = BorderRadius.circular(48 * k);

    Widget tile = Stack(
      fit: StackFit.expand,
      children: [
        ColoredBox(color: widget.ground),
        // linear-gradient(150deg, …) — CSS angles run clockwise from north, so
        // 150° points down and to the right.
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment(-0.5, -0.866),
              end: Alignment(0.5, 0.866),
              colors: [
                Color(0x38FFFFFF),
                Color(0x0DFFFFFF),
                Color(0x1AFFFFFF),
              ],
              stops: [0, 0.46, 1],
            ),
          ),
        ),
        // The two `inset` box-shadows. Flutter has no inset shadow, so they are
        // drawn as overlays: a hairline highlight along the top edge, and a
        // soft bloom rising off the bottom one.
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.bottomCenter,
              end: Alignment.topCenter,
              colors: const [Color(0x2EFFFFFF), Color(0x00FFFFFF)],
              stops: [0, 0.28],
            ),
          ),
        ),
        Align(
          alignment: Alignment.topCenter,
          child: Container(
            height: 1 * k.clamp(1, double.infinity),
            color: const Color(0x8CFFFFFF),
          ),
        ),
        Center(
          child: SizedBox.square(
            dimension: widget.size * widget.glyph._extent,
            child: _Glyph(
              glyph: widget.glyph,
              tint: widget.tint,
              tintBright: widget.tintBright,
            ),
          ),
        ),
        if (widget.hoverSheen)
          AnimatedBuilder(
            animation: _sheen,
            builder: (context, _) => _Sheen(progress: _sheen.value),
          ),
      ],
    );

    if (widget.frosted) {
      tile = BackdropFilter(
        filter: ui.ImageFilter.blur(sigmaX: 7 * k, sigmaY: 7 * k),
        child: tile,
      );
    }

    final lifted = widget.hoverLift && _hovered;

    Widget result = AnimatedContainer(
      duration: const Duration(milliseconds: 400),
      curve: Curves.easeOutCubic,
      transform: Matrix4.translationValues(0, lifted ? -6 * k : 0, 0),
      decoration: BoxDecoration(
        borderRadius: radius,
        border: Border.all(
          color: const Color(0x47FFFFFF),
          width: (1 * k).clamp(0.6, 4),
        ),
        boxShadow: [
          BoxShadow(
            color: lifted ? const Color(0xB3000000) : const Color(0xA6000000),
            offset: Offset(0, (lifted ? 34 : 26) * k),
            blurRadius: (lifted ? 60 : 50) * k,
            spreadRadius: -18 * k,
          ),
        ],
      ),
      child: ClipRRect(
        // Inset by the border so the glass does not paint over its own edge.
        borderRadius: radius,
        clipBehavior: Clip.antiAlias,
        child: tile,
      ),
    );

    if (widget.hoverSheen || widget.hoverLift) {
      result = MouseRegion(
        onEnter: (_) {
          if (widget.hoverSheen) _sheen.forward(from: 0);
          if (widget.hoverLift) setState(() => _hovered = true);
        },
        onExit: (_) {
          if (widget.hoverLift) setState(() => _hovered = false);
        },
        child: result,
      );
    }

    return SizedBox.square(dimension: widget.size, child: result);
  }
}

/// The raking highlight. `translateX(-140% → 240%)` at 18°, faded in over the
/// first eighth of the sweep and out across the rest.
class _Sheen extends StatelessWidget {
  final double progress;

  const _Sheen({required this.progress});

  @override
  Widget build(BuildContext context) {
    if (progress == 0 || progress == 1) return const SizedBox.shrink();

    // cubic-bezier(0.22, 1, 0.36, 1) — the board's ease-out.
    final eased = Curves.easeOutCubic.transform(progress);
    final opacity = progress < 0.12
        ? (progress / 0.12) * 0.9
        : 0.9 * (1 - (progress - 0.12) / 0.88);

    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth * 0.55;
        final travel = (-1.4 + 3.8 * eased) * width;

        return IgnorePointer(
          child: ClipRect(
            child: Stack(
              children: [
                Positioned(
                  left: -constraints.maxWidth * 0.4 + travel,
                  top: -constraints.maxHeight * 0.3,
                  width: width,
                  height: constraints.maxHeight * 1.6,
                  child: Transform.rotate(
                    angle: 18 * 3.1415926535 / 180,
                    child: Opacity(
                      opacity: opacity.clamp(0.0, 1.0),
                      child: const DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            colors: [
                              Color(0x00FFFFFF),
                              Color(0xA6FFFFFF),
                              Color(0x00FFFFFF),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

/// The mark itself. Everything but [AFGlassGlyph.af] is vector, drawn against
/// the board's 100-unit viewBox.
class _Glyph extends StatelessWidget {
  final AFGlassGlyph glyph;
  final Color tint;
  final Color tintBright;

  const _Glyph({
    required this.glyph,
    required this.tint,
    required this.tintBright,
  });

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _GlyphPainter(
        glyph: glyph,
        tint: tint,
        tintBright: tintBright,
      ),
    );
  }
}

class _GlyphPainter extends CustomPainter {
  final AFGlassGlyph glyph;
  final Color tint;
  final Color tintBright;

  _GlyphPainter({
    required this.glyph,
    required this.tint,
    required this.tintBright,
  });

  /// CSS blur radius to a Gaussian sigma. A CSS shadow's radius is about two
  /// standard deviations.
  static double _sigma(double cssBlur) => cssBlur / 2;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.scale(size.width / 100);

    switch (glyph) {
      case AFGlassGlyph.checklists:
        _paintCheck(canvas);
      case AFGlassGlyph.calendar:
        _paintCalendar(canvas);
      case AFGlassGlyph.habits:
        _paintHabits(canvas);
      case AFGlassGlyph.audio:
        _paintAudio(canvas);
      case AFGlassGlyph.ai:
        _paintAi(canvas);
      case AFGlassGlyph.qr:
        _paintQr(canvas);
      case AFGlassGlyph.af:
        _paintBrand(canvas);
    }

    canvas.restore();
  }

  /// `filter: drop-shadow(0 3px 8px rgba(0,0,0,0.4))` on the SVG root.
  void _dropShadow(Canvas canvas, Path path) {
    canvas.save();
    canvas.translate(0, 3);
    canvas.drawPath(
      path,
      Paint()
        ..color = const Color(0x66000000)
        ..maskFilter = MaskFilter.blur(BlurStyle.normal, _sigma(8)),
    );
    canvas.restore();
  }

  void _glow(Canvas canvas, Path path, Color color, double blur) {
    canvas.drawPath(
      path,
      Paint()
        ..color = color
        ..maskFilter = MaskFilter.blur(BlurStyle.normal, _sigma(blur)),
    );
  }

  void _paintCheck(Canvas canvas) {
    final path = Path()
      ..moveTo(17, 51)
      ..lineTo(41, 77)
      ..lineTo(86, 22)
      ..lineTo(79, 17)
      ..lineTo(41, 61)
      ..lineTo(22, 48)
      ..close();

    _dropShadow(canvas, path);
    _glow(canvas, path, tint.withValues(alpha: 0.85), 7);

    canvas.drawPath(path, Paint()..color = tint.withValues(alpha: 0.4));
    canvas.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.4
        ..strokeJoin = StrokeJoin.round
        ..color = tintBright.withValues(alpha: 0.95),
    );
  }

  void _paintCalendar(Canvas canvas) {
    // The lit cell goes down first — the lattice crosses over it, so the pane
    // only shows in the four quarters between the rods.
    final cell = Path()
      ..addRRect(RRect.fromLTRBR(40, 40, 60, 60, const Radius.circular(4)));
    _glow(canvas, cell, tint.withValues(alpha: 0.9), 8);
    canvas.drawPath(cell, Paint()..color = tint.withValues(alpha: 0.85));

    final rods = Path();
    for (final x in const [27.0, 46.5, 66.0]) {
      rods.addRRect(
        RRect.fromLTRBR(x, 16, x + 7, 84, const Radius.circular(3.5)),
      );
    }
    for (final y in const [27.0, 46.5, 66.0]) {
      rods.addRRect(
        RRect.fromLTRBR(16, y, 84, y + 7, const Radius.circular(3.5)),
      );
    }

    _dropShadow(canvas, rods);
    canvas.drawPath(rods, Paint()..color = const Color(0x28FFFFFF));
    canvas.drawPath(
      rods,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.2
        ..color = const Color(0xB8FFFFFF),
    );
  }

  /// A waveform: five capsules about a centre line, the middle one lit.
  ///
  /// Symmetric about the middle rather than standing on a baseline, which is
  /// what keeps it from reading as the habits chart at favicon size. A musical
  /// note was the other candidate and turns to mush at 32px.
  /// A frame with two caption lines across its lower half — the shape a
  /// subtitled still has, which reads faster than the letters "CC".
  /// The reAFresh mark: a square refresh cycle around the masthead's tick.
  ///
  /// Two ideas, both already in the app. The square accent tick is what sits
  /// at the left of every masthead, so it is the thing already associated with
  /// this app; the cycle around it is the "re" of the name. Built from
  /// rectangles and triangles because the design has no curves in it anywhere
  /// else — a round arrow would be the only circle in the whole product.
  ///
  /// Drawn rather than typeset. The old mark set the letters "AF" in the
  /// heaviest system sans, which meant the logo rendered differently on every
  /// platform; paths render identically everywhere and at every size.
  void _paintBrand(Canvas canvas) {
    const t = 9.0; // arm thickness
    const outer = 20.0;
    const far = 80.0;

    // Each arm is two sides of a square, so the pair reads as one loop with
    // two gaps rather than as a broken box.
    final arms = Path()
      // Top arm, running left to right, then down the left side.
      ..addRect(const Rect.fromLTRB(outer, outer, 63, outer + t))
      ..addRect(const Rect.fromLTRB(outer, outer, outer + t, 63))
      // Bottom arm, mirrored.
      ..addRect(const Rect.fromLTRB(37, far - t, far, far))
      ..addRect(const Rect.fromLTRB(far - t, 37, far, far))
      // Arrowheads: the loop has a direction, which is what separates a cycle
      // from a broken frame.
      ..addPolygon(const [Offset(58, 12), Offset(80, 24.5), Offset(58, 37)], true)
      ..addPolygon(const [Offset(42, 88), Offset(20, 75.5), Offset(42, 63)], true);

    _dropShadow(canvas, arms);
    canvas.drawPath(arms, Paint()..color = const Color(0x2EFFFFFF));
    canvas.drawPath(
      arms,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.3
        ..strokeJoin = StrokeJoin.round
        ..color = const Color(0xC4FFFFFF),
    );

    // The tick itself, lit — the same 2px-radius square the masthead draws,
    // scaled up.
    final tick = Path()
      ..addRRect(RRect.fromLTRBR(41, 41, 59, 59, const Radius.circular(3)));

    _glow(canvas, tick, tint.withValues(alpha: 0.9), 9);
    canvas.drawPath(tick, Paint()..color = tint);
  }

  /// Two four-pointed sparks, the larger lit.
  ///
  /// The concave star is the one shape that reads as "this was generated"
  /// across every platform, and it is built from straight lines, which suits a
  /// design that has no curves in it anywhere else.
  void _paintAi(Canvas canvas) {
    // Drawn under the bright one so the pair reads as near and far rather than
    // as two of the same thing.
    final small = _spark(72, 26, 15, 4);
    _dropShadow(canvas, small);
    canvas.drawPath(small, Paint()..color = const Color(0x3DFFFFFF));
    canvas.drawPath(
      small,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.2
        ..strokeJoin = StrokeJoin.round
        ..color = const Color(0xB8FFFFFF),
    );

    final large = _spark(43, 55, 33, 9);
    _dropShadow(canvas, large);
    _glow(canvas, large, tint.withValues(alpha: 0.85), 8);

    canvas.drawPath(large, Paint()..color = tint.withValues(alpha: 0.55));
    canvas.drawPath(
      large,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5
        ..strokeJoin = StrokeJoin.round
        ..color = tintBright.withValues(alpha: 0.95),
    );
  }

  /// A four-pointed star: points on the axes at [outer], waists on the
  /// diagonals at [inner].
  Path _spark(double cx, double cy, double outer, double inner) {
    // 0.7071 is cos 45°, which is where the waists sit.
    final waist = inner * 0.7071;
    return Path()
      ..moveTo(cx, cy - outer)
      ..lineTo(cx + waist, cy - waist)
      ..lineTo(cx + outer, cy)
      ..lineTo(cx + waist, cy + waist)
      ..lineTo(cx, cy + outer)
      ..lineTo(cx - waist, cy + waist)
      ..lineTo(cx - outer, cy)
      ..lineTo(cx - waist, cy - waist)
      ..close();
  }

  void _paintAudio(Canvas canvas) {
    const centre = 50.0;
    const width = 9.0;
    const bars = [
      (x: 13.5, half: 12.0),
      (x: 29.5, half: 24.0),
      (x: 45.5, half: 34.0),
      (x: 61.5, half: 21.0),
      (x: 77.5, half: 14.0),
    ];

    final quiet = Path();
    for (final bar in bars) {
      if (bar.x == 45.5) continue;
      quiet.addRRect(
        RRect.fromLTRBR(
          bar.x,
          centre - bar.half,
          bar.x + width,
          centre + bar.half,
          const Radius.circular(4.5),
        ),
      );
    }

    _dropShadow(canvas, quiet);
    canvas.drawPath(quiet, Paint()..color = const Color(0x28FFFFFF));
    canvas.drawPath(
      quiet,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.6
        ..color = const Color(0xB8FFFFFF),
    );

    final peak = Path()
      ..addRRect(
        RRect.fromLTRBR(
          45.5,
          centre - 34,
          45.5 + width,
          centre + 34,
          const Radius.circular(4.5),
        ),
      );

    _glow(canvas, peak, tint.withValues(alpha: 0.8), 8);
    canvas.drawPath(peak, Paint()..color = tint.withValues(alpha: 0.9));
  }

  /// Three climbing bars over a baseline — the completion chart, in miniature.
  /// The tallest is lit, the way the chart lights the day you are on.
  void _paintHabits(Canvas canvas) {
    const base = 84.0;

    final rising = Path();
    for (final bar in const [
      (x: 18.0, top: 58.0),
      (x: 42.0, top: 40.0),
    ]) {
      rising.addRRect(
        RRect.fromLTRBAndCorners(
          bar.x,
          bar.top,
          bar.x + 20,
          base,
          topLeft: const Radius.circular(4),
          topRight: const Radius.circular(4),
        ),
      );
    }

    _dropShadow(canvas, rising);
    canvas.drawPath(rising, Paint()..color = const Color(0x28FFFFFF));
    canvas.drawPath(
      rising,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.6
        ..color = const Color(0xB8FFFFFF),
    );

    final peak = Path()
      ..addRRect(
        RRect.fromLTRBAndCorners(
          66,
          20,
          86,
          base,
          topLeft: const Radius.circular(4),
          topRight: const Radius.circular(4),
        ),
      );

    _glow(canvas, peak, tint.withValues(alpha: 0.8), 8);
    canvas.drawPath(peak, Paint()..color = tint.withValues(alpha: 0.9));

    canvas.drawRRect(
      RRect.fromLTRBR(14, base, 90, base + 3, const Radius.circular(1.5)),
      Paint()..color = const Color(0xB8FFFFFF),
    );
  }

  void _paintQr(Canvas canvas) {
    final frames = Path();
    for (final origin in const [Offset(14, 14), Offset(56, 14), Offset(14, 56)]) {
      frames.addRRect(
        RRect.fromLTRBR(
          origin.dx,
          origin.dy,
          origin.dx + 30,
          origin.dy + 30,
          const Radius.circular(7),
        ),
      );
    }

    _dropShadow(canvas, frames);
    canvas.drawPath(
      frames,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3.4
        ..color = const Color(0xBFFFFFFF),
    );

    final eyes = Path();
    for (final origin in const [Offset(23, 23), Offset(65, 23), Offset(23, 65)]) {
      eyes.addRRect(
        RRect.fromLTRBR(
          origin.dx,
          origin.dy,
          origin.dx + 12,
          origin.dy + 12,
          const Radius.circular(3),
        ),
      );
    }

    _glow(canvas, eyes, tint.withValues(alpha: 0.8), 6);
    canvas.drawPath(eyes, Paint()..color = tint.withValues(alpha: 0.9));
  }

  @override
  bool shouldRepaint(_GlyphPainter old) =>
      old.glyph != glyph || old.tint != tint || old.tintBright != tintBright;
}
