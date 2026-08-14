import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../programs/af_program.dart';
import '../theme/af_text.dart';
import '../theme/af_tokens.dart';
import 'af_account_button.dart';
import 'af_theme_toggle.dart';

class AFNavDestination {
  final String label;
  final String route;

  const AFNavDestination({required this.label, required this.route});
}

/// Derived from [afPrograms] rather than listed again here, so adding a program
/// really does reach the nav bar from one edit. The dashboard leads because it
/// is the shell itself, not a program.
final List<AFNavDestination> afNavDestinations = [
  const AFNavDestination(label: 'Dashboard', route: '/dashboard'),
  for (final program in afPrograms)
    AFNavDestination(label: program.navLabel, route: program.route),
];

/// Persistent top navigation, shown only on desktop widths.
///
/// Sits on the panel colour so it reads as app chrome above the desk, and
/// marks the active section with an accent underline rather than a filled
/// pill — filled shapes would fight the segmented controls used inside pages.
class AFNavBar extends StatelessWidget {
  /// The current location, used to decide which destination is active.
  final String location;

  /// Matches the content column of the page below it.
  final double maxWidth;

  const AFNavBar({
    super.key,
    required this.location,
    required this.maxWidth,
  });

  @override
  Widget build(BuildContext context) {
    final t = context.af;

    return Container(
      decoration: BoxDecoration(
        color: t.panel,
        border: Border(bottom: BorderSide(color: t.line)),
      ),
      child: Center(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: maxWidth),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
            child: Row(
              children: [
                _Brand(onTap: () => context.go('/dashboard')),
                const SizedBox(width: 28),
                for (final destination in afNavDestinations)
                  _NavLink(
                    destination: destination,
                    active: _isActive(destination.route),
                  ),
                const Spacer(),
                const AFAccountButton(),
                const SizedBox(width: 10),
                const AFThemeToggle(),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// `/checklists/3` should still light up the Checklists tab.
  bool _isActive(String route) =>
      location == route || location.startsWith('$route/');
}

class _Brand extends StatelessWidget {
  final VoidCallback onTap;

  const _Brand({required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = context.af;

    return MouseRegion(
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: onTap,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 11,
              height: 11,
              margin: const EdgeInsets.only(right: 9),
              decoration: BoxDecoration(
                color: t.accent,
                borderRadius: BorderRadius.circular(2),
                boxShadow: [
                  BoxShadow(color: t.accentSoft, spreadRadius: 3, blurRadius: 0),
                ],
              ),
            ),
            Text(
              'reAFresh',
              style: AFText.mono(
                size: 16,
                color: t.ink,
                weight: FontWeight.w700,
                letterSpacing: 0.5,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _NavLink extends StatefulWidget {
  final AFNavDestination destination;
  final bool active;

  const _NavLink({required this.destination, required this.active});

  @override
  State<_NavLink> createState() => _NavLinkState();
}

class _NavLinkState extends State<_NavLink> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    final t = context.af;
    final active = widget.active;

    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hovered = true),
      onExit: (_) => setState(() => _hovered = false),
      child: GestureDetector(
        onTap: () => context.go(widget.destination.route),
        child: Semantics(
          button: true,
          selected: active,
          child: Container(
            margin: const EdgeInsets.only(right: 4),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
            decoration: BoxDecoration(
              border: Border(
                bottom: BorderSide(
                  color: active ? t.accent : Colors.transparent,
                  width: 2,
                ),
              ),
            ),
            child: Text(
              widget.destination.label.toUpperCase(),
              style: AFText.mono(
                size: 11.5,
                color: active || _hovered ? t.ink : t.muted,
                weight: active ? FontWeight.w700 : FontWeight.w600,
                letterSpacing: 1.0,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
