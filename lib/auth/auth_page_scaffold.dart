import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../theme/af_text.dart';
import '../theme/af_tokens.dart';

/// Chrome for the signed-out pages.
///
/// Deliberately outside `AFShell`: someone who is not signed in has nowhere to
/// navigate, so a nav bar full of locked destinations would be noise. Just the
/// brand, one panel, and a way back to the dashboard.
class AuthPageScaffold extends StatelessWidget {
  final String label;
  final Widget child;

  const AuthPageScaffold({
    super.key,
    required this.label,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    final t = context.af;

    return Scaffold(
      backgroundColor: t.desk,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 28),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(
                        width: 11,
                        height: 11,
                        margin: const EdgeInsets.only(right: 9),
                        decoration: BoxDecoration(
                          color: t.accent,
                          borderRadius: BorderRadius.circular(2),
                          boxShadow: [
                            BoxShadow(
                              color: t.accentSoft,
                              spreadRadius: 3,
                              blurRadius: 0,
                            ),
                          ],
                        ),
                      ),
                      Text('AF', style: AFText.brand(context)),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'field tools, on every device you use',
                    textAlign: TextAlign.center,
                    style: AFText.meta(context),
                  ),
                  const SizedBox(height: 24),
                  child,
                  const SizedBox(height: 18),
                  Center(
                    child: TextButton(
                      onPressed: () => context.go('/dashboard'),
                      child: Text(
                        '← back to dashboard',
                        style: AFText.mono(size: 12, color: t.muted),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// "or" between the credential form and the Google button.
class AuthDivider extends StatelessWidget {
  const AuthDivider({super.key});

  @override
  Widget build(BuildContext context) {
    final t = context.af;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Row(
        children: [
          Expanded(child: Divider(color: t.line, height: 1)),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10),
            child: Text(
              'OR',
              style: AFText.mono(size: 10, color: t.muted, letterSpacing: 1.2),
            ),
          ),
          Expanded(child: Divider(color: t.line, height: 1)),
        ],
      ),
    );
  }
}
