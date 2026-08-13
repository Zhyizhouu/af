import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/theme_provider.dart';
import 'af_button.dart';

/// Masthead control that cycles system → light → dark.
///
/// Self-contained so any screen can drop it into `AFScaffold.actions` without
/// becoming a Consumer itself.
class AFThemeToggle extends ConsumerWidget {
  const AFThemeToggle({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mode = ref.watch(themeModeProvider);
    final affordance = themeModeAffordance(mode);

    return AFIconButton(
      icon: affordance.icon,
      tooltip: '${affordance.label} — tap to change',
      onPressed: () => ref.read(themeModeProvider.notifier).cycle(),
    );
  }
}
