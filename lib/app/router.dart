import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../programs/calendar/calendar_screen.dart';
import '../programs/checklist/checklist_detail_screen.dart';
import '../programs/checklist/checklist_home_screen.dart';
import '../programs/qr/qr_screen.dart';
import '../screens/dashboard_screen.dart';
import '../theme/af_tokens.dart';
import '../widgets/af_scaffold.dart';
import 'af_shell.dart';

/// Every route lives under one [ShellRoute] so the nav bar is built once and
/// survives navigation instead of being rebuilt per page.
final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/dashboard',
    redirect: (context, state) =>
        state.uri.path == '/' ? '/dashboard' : null,
    errorBuilder: (context, state) => AFShell(
      location: state.uri.path,
      child: AFScaffold(
        title: 'AF',
        onBack: () => context.go('/dashboard'),
        child: AFEmptyState(
          glyph: '404',
          message: 'No program lives at ${state.uri.path}.',
          color: context.af.warn,
        ),
      ),
    ),
    routes: [
      ShellRoute(
        builder: (context, state, child) =>
            AFShell(location: state.uri.path, child: child),
        routes: [
          GoRoute(
            path: '/dashboard',
            builder: (context, state) => const DashboardScreen(),
          ),
          GoRoute(
            path: '/checklists',
            builder: (context, state) => const ChecklistHomeScreen(),
            routes: [
              GoRoute(
                path: ':sessionKey',
                builder: (context, state) => ChecklistDetailScreen(
                  sessionKey: state.pathParameters['sessionKey']!,
                ),
              ),
            ],
          ),
          GoRoute(
            path: '/calendar',
            builder: (context, state) => const CalendarScreen(),
          ),
          GoRoute(
            path: '/qr',
            builder: (context, state) => const QrScreen(),
          ),
        ],
      ),
    ],
  );
});
