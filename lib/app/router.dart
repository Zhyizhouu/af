import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../auth/auth_controller.dart';
import '../auth/register_screen.dart';
import '../auth/sign_in_screen.dart';
import '../programs/calendar/calendar_screen.dart';
import '../programs/checklist/checklist_detail_screen.dart';
import '../programs/checklist/checklist_home_screen.dart';
import '../programs/ai/ai_screen.dart';
import '../programs/audio/audio_screen.dart';
import '../programs/habits/habits_screen.dart';
import '../programs/qr/qr_screen.dart';
import '../screens/dashboard_screen.dart';
import '../theme/af_tokens.dart';
import '../widgets/af_scaffold.dart';
import 'af_shell.dart';

/// Routes reachable without an account.
///
/// The dashboard is deliberately open: a signed-out visitor should see what AF
/// contains — with each program shown as locked — rather than a bare login
/// wall that explains nothing.
const _publicRoutes = {'/dashboard', '/signin', '/register'};

const _authRoutes = {'/signin', '/register'};

/// Every program route lives under one [ShellRoute] so the nav bar is built
/// once and survives navigation. The auth pages sit outside it — they have
/// their own chrome, since a signed-out visitor has nowhere to navigate.
final routerProvider = Provider<GoRouter>((ref) {
  // GoRouter re-evaluates `redirect` when this notifies, which is how signing
  // in or out moves the user without any screen calling go() itself.
  final refresh = ValueNotifier<int>(0);
  ref.onDispose(refresh.dispose);
  ref.listen(authStateProvider, (_, __) => refresh.value++);

  return GoRouter(
    initialLocation: '/dashboard',
    refreshListenable: refresh,
    redirect: (context, state) {
      final path = state.uri.path;
      if (path == '/') return '/dashboard';

      final auth = ref.read(authStateProvider);

      // Firebase restores a persisted session a beat after startup. Bouncing
      // during that window would sign-out-flash every cold start.
      if (auth.isLoading) return null;

      final signedIn = auth.valueOrNull != null;

      if (!signedIn && !_publicRoutes.contains(path)) return '/signin';
      if (signedIn && _authRoutes.contains(path)) return '/dashboard';
      return null;
    },
    errorBuilder: (context, state) => AFShell(
      location: state.uri.path,
      child: AFScaffold(
        title: 'reAFresh',
        onBack: () => context.go('/dashboard'),
        child: AFEmptyState(
          glyph: '404',
          message: 'No program lives at ${state.uri.path}.',
          color: context.af.warn,
        ),
      ),
    ),
    routes: [
      GoRoute(
        path: '/signin',
        builder: (context, state) => const SignInScreen(),
      ),
      GoRoute(
        path: '/register',
        builder: (context, state) => const RegisterScreen(),
      ),
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
            path: '/habits',
            builder: (context, state) => const HabitsScreen(),
          ),
          GoRoute(
            path: '/audio',
            builder: (context, state) => const AudioScreen(),
          ),
          GoRoute(
            path: '/ai',
            builder: (context, state) => const AiScreen(),
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
