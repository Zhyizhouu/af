import 'package:flutter/material.dart';

/// Design tokens for the AF design language.
///
/// These mirror the CSS custom properties in `AF-QRgenerator.html`: a
/// "technical instrument" look built from hairline rules, monospace labels and
/// a single electric accent, with nothing rounder than 4px.
///
/// [dark] is the same system with the ink/desk roles swapped, so widgets never
/// branch on brightness — they just read tokens off the context.
@immutable
class AFTokens extends ThemeExtension<AFTokens> {
  /// Page background sitting behind the panels.
  final Color desk;

  /// Panel surface — the equivalent of `--panel`.
  final Color panel;

  /// Recessed surface for inputs and unselected controls.
  final Color sunken;

  /// Primary text and the fill of solid buttons.
  final Color ink;

  /// Secondary text: panel labels, values, hints, timestamps.
  final Color muted;

  /// Hairline rule used for panel edges.
  final Color line;

  /// Heavier rule used on interactive edges (inputs, segmented controls).
  final Color lineStrong;

  /// The single accent. Used for focus, selection and live state.
  final Color accent;

  /// Accent at ~10-14% — focus rings and soft fills.
  final Color accentSoft;

  /// Destructive / attention state.
  final Color warn;
  final Color warnSoft;

  /// Confirmation state (contrast checks, completed sessions).
  final Color ok;

  /// Corner radius. Deliberately small — this look is squared off.
  final double radius;

  const AFTokens({
    required this.desk,
    required this.panel,
    required this.sunken,
    required this.ink,
    required this.muted,
    required this.line,
    required this.lineStrong,
    required this.accent,
    required this.accentSoft,
    required this.warn,
    required this.warnSoft,
    required this.ok,
    required this.radius,
  });

  /// Lifted verbatim from the QR Generator stylesheet.
  static const AFTokens light = AFTokens(
    desk: Color(0xFFE7E9ED),
    panel: Color(0xFFFFFFFF),
    sunken: Color(0xFFFBFBFC),
    ink: Color(0xFF14161B),
    muted: Color(0xFF767C86),
    line: Color(0xFFDEE1E6),
    lineStrong: Color(0xFFC9CDD4),
    accent: Color(0xFF3B49FF),
    accentSoft: Color(0x1A3B49FF),
    warn: Color(0xFFB4451B),
    warnSoft: Color(0x1AB4451B),
    ok: Color(0xFF2E7D46),
    radius: 4,
  );

  /// The same system inverted. Accent is lifted so it still reads as electric
  /// against a dark desk, and the rules are warmed slightly to stay visible.
  static const AFTokens dark = AFTokens(
    desk: Color(0xFF0E1013),
    panel: Color(0xFF16191E),
    sunken: Color(0xFF1B1F26),
    ink: Color(0xFFE6E8EC),
    muted: Color(0xFF8B929E),
    line: Color(0xFF262B33),
    lineStrong: Color(0xFF363D48),
    accent: Color(0xFF5D69FF),
    accentSoft: Color(0x245D69FF),
    warn: Color(0xFFE0763F),
    warnSoft: Color(0x24E0763F),
    ok: Color(0xFF4CAF6B),
    radius: 4,
  );

  /// Foreground for solid [ink] buttons. In light mode this is the panel
  /// (white on near-black); in dark mode it is the desk (near-black on a pale
  /// button), which keeps the same contrast relationship in both themes.
  Color get onInk => desk.computeLuminance() > 0.5 ? panel : desk;

  BorderRadius get borderRadius => BorderRadius.circular(radius);

  Border get hairline => Border.all(color: line, width: 1);

  Border get hairlineStrong => Border.all(color: lineStrong, width: 1);

  @override
  AFTokens copyWith({
    Color? desk,
    Color? panel,
    Color? sunken,
    Color? ink,
    Color? muted,
    Color? line,
    Color? lineStrong,
    Color? accent,
    Color? accentSoft,
    Color? warn,
    Color? warnSoft,
    Color? ok,
    double? radius,
  }) {
    return AFTokens(
      desk: desk ?? this.desk,
      panel: panel ?? this.panel,
      sunken: sunken ?? this.sunken,
      ink: ink ?? this.ink,
      muted: muted ?? this.muted,
      line: line ?? this.line,
      lineStrong: lineStrong ?? this.lineStrong,
      accent: accent ?? this.accent,
      accentSoft: accentSoft ?? this.accentSoft,
      warn: warn ?? this.warn,
      warnSoft: warnSoft ?? this.warnSoft,
      ok: ok ?? this.ok,
      radius: radius ?? this.radius,
    );
  }

  @override
  AFTokens lerp(ThemeExtension<AFTokens>? other, double t) {
    if (other is! AFTokens) return this;
    return AFTokens(
      desk: Color.lerp(desk, other.desk, t)!,
      panel: Color.lerp(panel, other.panel, t)!,
      sunken: Color.lerp(sunken, other.sunken, t)!,
      ink: Color.lerp(ink, other.ink, t)!,
      muted: Color.lerp(muted, other.muted, t)!,
      line: Color.lerp(line, other.line, t)!,
      lineStrong: Color.lerp(lineStrong, other.lineStrong, t)!,
      accent: Color.lerp(accent, other.accent, t)!,
      accentSoft: Color.lerp(accentSoft, other.accentSoft, t)!,
      warn: Color.lerp(warn, other.warn, t)!,
      warnSoft: Color.lerp(warnSoft, other.warnSoft, t)!,
      ok: Color.lerp(ok, other.ok, t)!,
      radius: lerpDouble(radius, other.radius, t),
    );
  }

  static double lerpDouble(double a, double b, double t) => a + (b - a) * t;
}

extension AFTokensContext on BuildContext {
  /// The active AF design tokens. Present on every theme built by `AppTheme`.
  AFTokens get af => Theme.of(this).extension<AFTokens>() ?? AFTokens.light;
}
