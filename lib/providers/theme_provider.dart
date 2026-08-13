import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../db/database_helper.dart';

const _themeModeKey = 'theme_mode';

/// Theme mode, persisted in the shared settings box so the choice survives
/// restarts. Defaults to following the system.
class ThemeModeController extends StateNotifier<ThemeMode> {
  ThemeModeController() : super(_load());

  static ThemeMode _load() {
    final stored = DatabaseHelper.instance.getSetting<String>(_themeModeKey);
    return switch (stored) {
      'light' => ThemeMode.light,
      'dark' => ThemeMode.dark,
      _ => ThemeMode.system,
    };
  }

  Future<void> set(ThemeMode mode) async {
    state = mode;
    await DatabaseHelper.instance.setSetting(_themeModeKey, mode.name);
  }

  /// system → light → dark → system. Bound to the masthead toggle.
  Future<void> cycle() => set(switch (state) {
        ThemeMode.system => ThemeMode.light,
        ThemeMode.light => ThemeMode.dark,
        ThemeMode.dark => ThemeMode.system,
      });
}

final themeModeProvider =
    StateNotifierProvider<ThemeModeController, ThemeMode>(
  (ref) => ThemeModeController(),
);

/// Icon and tooltip for the current theme mode.
({IconData icon, String label}) themeModeAffordance(ThemeMode mode) {
  return switch (mode) {
    ThemeMode.system => (icon: Icons.brightness_auto_outlined, label: 'Theme: system'),
    ThemeMode.light => (icon: Icons.light_mode_outlined, label: 'Theme: light'),
    ThemeMode.dark => (icon: Icons.dark_mode_outlined, label: 'Theme: dark'),
  };
}
