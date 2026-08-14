import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/data_scope.dart';
import 'app/firebase_init.dart';
import 'app/router.dart';
import 'app/url_strategy.dart';
import 'auth/auth_controller.dart';
import 'db/database_helper.dart';
import 'db/seed_habits.dart';
import 'db/seed_template.dart';
import 'db/sync_migration.dart';
import 'programs/habits/habit_provider.dart';
import 'providers/theme_provider.dart';
import 'theme/app_theme.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  configureUrlStrategy();

  // Firebase first, but never fatally — see [initFirebase].
  await initFirebase();

  await DatabaseHelper.instance.init();
  await seedTemplateIfEmpty();
  await seedHabitsIfEmpty();
  await runSyncMigration();

  runApp(const ProviderScope(child: AFApp()));
}

class AFApp extends ConsumerStatefulWidget {
  const AFApp({super.key});

  @override
  ConsumerState<AFApp> createState() => _AFAppState();
}

class _AFAppState extends ConsumerState<AFApp> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// The midnight timer only fires if the app was awake to run it. A suspended
  /// phone or a throttled browser tab will have slept straight through the
  /// rollover, so coming back to the foreground re-checks the date.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      ref.read(currentDayProvider.notifier).refresh();
    }
  }

  @override
  Widget build(BuildContext context) {
    // Swap the local database to whoever is signed in — including on a cold
    // start, where Firebase restores the session a beat after startup. The
    // scope switch is also what pulls the account's data down, so syncing is
    // not triggered separately: doing both would risk a sync landing against
    // the scope that is on its way out.
    ref.listen(authStateProvider, (previous, next) {
      ref.read(dataScopeProvider.notifier).switchTo(next.valueOrNull?.uid);
    });

    return MaterialApp.router(
      title: 'AF',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: ref.watch(themeModeProvider),
      routerConfig: ref.watch(routerProvider),
    );
  }
}
