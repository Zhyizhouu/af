import 'package:flutter/widgets.dart';

/// Layout thresholds, kept in one place so the shell, the dashboard and the
/// individual programs all agree on what "desktop" means.
class AFBreakpoints {
  AFBreakpoints._();

  /// At or above this the persistent navigation bar appears and screens stop
  /// drawing their own per-page navigation affordances.
  static const double desktop = 900;

  /// Two-column program layouts (the QR Generator's controls/preview split).
  static const double split = 760;

  /// Two-column tile grids.
  static const double twoColumn = 620;

  static bool isDesktop(BuildContext context) =>
      MediaQuery.sizeOf(context).width >= desktop;
}
