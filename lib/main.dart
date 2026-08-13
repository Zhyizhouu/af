import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/firebase_init.dart';
import 'app/router.dart';
import 'app/url_strategy.dart';
import 'auth/auth_controller.dart';
import 'db/database_helper.dart';
import 'db/seed_template.dart';
import 'db/sync_migration.dart';
import 'providers/theme_provider.dart';
import 'sync/sync_controller.dart';
import 'theme/app_theme.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  configureUrlStrategy();

  // Firebase first, but never fatally — see [initFirebase].
  await initFirebase();

  await DatabaseHelper.instance.init();
  await seedTemplateIfEmpty();
  await runSyncMigration();

  runApp(const ProviderScope(child: AFApp()));
}

class AFApp extends ConsumerWidget {
  const AFApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Pull the account's data down as soon as somebody signs in, including on
    // a cold start where the session was restored from disk.
    ref.listen(authStateProvider, (previous, next) {
      if (next.valueOrNull != null) {
        ref.read(syncControllerProvider.notifier).syncNow();
      }
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
