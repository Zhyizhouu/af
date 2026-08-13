import 'package:flutter/material.dart';

import '../theme/af_breakpoints.dart';
import '../theme/af_tokens.dart';
import '../widgets/af_nav_bar.dart';
import '../widgets/af_scaffold.dart';

/// App chrome wrapped around every route.
///
/// Owns the [Scaffold] — so pages themselves are plain content columns — and
/// adds the persistent navigation bar once there is room for it. Below the
/// desktop breakpoint navigation falls back to each page's own masthead and
/// back affordance, which is what a phone wants anyway.
class AFShell extends StatelessWidget {
  final Widget child;

  /// Current path, forwarded to the nav bar for active-state matching.
  final String location;

  const AFShell({super.key, required this.child, required this.location});

  @override
  Widget build(BuildContext context) {
    final t = context.af;
    final desktop = AFBreakpoints.isDesktop(context);

    return Scaffold(
      backgroundColor: t.desk,
      body: SafeArea(
        child: Column(
          children: [
            if (desktop)
              AFNavBar(
                location: location,
                maxWidth: AFScaffold.maxContentWidth,
              ),
            Expanded(child: child),
          ],
        ),
      ),
    );
  }
}
