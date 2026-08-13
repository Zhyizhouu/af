import 'package:flutter/material.dart';

import 'af_tokens.dart';

/// Typography for the AF design language.
///
/// The rule from the QR Generator: **monospace carries all the machinery**
/// (labels, values, buttons, metadata, anything numeric) while the system sans
/// carries human prose (checklist items, course names, descriptions). Keeping
/// that split is most of what makes the look cohere.
class AFText {
  AFText._();

  /// Ordered fallbacks. Flutter walks these until one resolves, so the stack
  /// covers macOS/iOS, Windows, Android and Linux without bundling a font.
  static const List<String> monoStack = <String>[
    'Menlo',
    'Consolas',
    'Cascadia Mono',
    'Roboto Mono',
    'DejaVu Sans Mono',
    'monospace',
  ];

  static TextStyle mono({
    required double size,
    Color? color,
    FontWeight weight = FontWeight.w400,
    double letterSpacing = 0,
    double? height,
    TextDecoration? decoration,
  }) {
    return TextStyle(
      fontFamily: monoStack.first,
      fontFamilyFallback: monoStack.sublist(1),
      fontSize: size,
      color: color,
      fontWeight: weight,
      letterSpacing: letterSpacing,
      height: height,
      decoration: decoration,
    );
  }

  /// `.panel-label` — 11px mono, uppercase, .14em tracking, muted.
  static TextStyle panelLabel(BuildContext context) =>
      mono(size: 11, color: context.af.muted, letterSpacing: 1.54);

  /// The value that sits at the right end of a panel label.
  static TextStyle panelCount(BuildContext context) =>
      mono(size: 11, color: context.af.ink, letterSpacing: 1.54);

  /// `.field-head label` — 12px mono, .04em tracking.
  static TextStyle fieldLabel(BuildContext context) =>
      mono(size: 12, color: context.af.ink, letterSpacing: 0.48);

  /// `.field-head .val` — the muted read-out beside a field label.
  static TextStyle fieldValue(BuildContext context) =>
      mono(size: 12, color: context.af.muted, letterSpacing: 0.48);

  /// `.brand` — 19px mono 700.
  static TextStyle brand(BuildContext context) =>
      mono(size: 19, color: context.af.ink, weight: FontWeight.w700, letterSpacing: 0.38);

  /// `.tagline`, `.hint`, `.filename` — small mono metadata.
  static TextStyle meta(BuildContext context, {Color? color}) =>
      mono(size: 11.5, color: color ?? context.af.muted, letterSpacing: 0.23, height: 1.55);

  /// `.btn` — 13px mono 600.
  static TextStyle button(BuildContext context, {Color? color}) =>
      mono(size: 13, color: color, weight: FontWeight.w600, letterSpacing: 0.26);

  /// Body prose. System sans, 1.5 line height, ink.
  static TextStyle body(BuildContext context, {Color? color, TextDecoration? decoration}) =>
      TextStyle(
        fontSize: 14.5,
        height: 1.5,
        color: color ?? context.af.ink,
        decoration: decoration,
      );

  /// A prose title — course names, session headings.
  static TextStyle title(BuildContext context, {Color? color}) => TextStyle(
        fontSize: 16,
        height: 1.4,
        fontWeight: FontWeight.w600,
        color: color ?? context.af.ink,
      );
}
