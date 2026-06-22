import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'screens/home_screen.dart';
import 'db/database_helper.dart';
import 'db/seed_template.dart';
import 'theme/app_theme.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await DatabaseHelper.instance.init();
  await seedTemplateIfEmpty();
  runApp(const ProviderScope(child: AFApp()));
}

class AFApp extends StatelessWidget {
  const AFApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'AF',
      theme: AppTheme.dark,
      darkTheme: AppTheme.dark,
      themeMode: ThemeMode.dark,
      home: const HomeScreen(),
    );
  }
}
