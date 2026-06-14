import 'package:af/models/proctor_session..dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/session_provider.dart';
import '../widgets/app_background.dart';
import '../widgets/glass_container.dart';

class ChecklistDetailScreen extends ConsumerWidget {
  final ProctorSession session;

  const ChecklistDetailScreen({super.key, required this.session});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final checklistAsync = ref.watch(sessionChecklistProvider(session.id!));

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(title: Text('${session.type} - Room ${session.room}')),
      body: AppBackground(
        child: checklistAsync.when(
          data: (items) {
            final sections = <String, List<dynamic>>{};
            for (final item in items) {
              sections.putIfAbsent(item.section, () => []).add(item);
            }

            final total = items.length;
            final checked = items.where((i) => i.isChecked).length;
            final progress = total == 0 ? 0.0 : checked / total;

            return Stack(
              children: [
                ListView(
                  padding: const EdgeInsets.fromLTRB(0, 100, 0, 100),
                  children: [
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (session.courseCode.isNotEmpty)
                            Text(
                              '${session.courseCode} - ${session.courseName} ${session.courseClass}',
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                          const SizedBox(height: 4),
                          Text(
                            session.dateTime.toString().substring(0, 16),
                            style: const TextStyle(color: Colors.white60),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    for (final entry in sections.entries) ...[
                      GlassContainer(
                        margin: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 6,
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Padding(
                              padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                              child: Text(
                                entry.key,
                                style: Theme.of(context).textTheme.titleSmall
                                    ?.copyWith(
                                      fontWeight: FontWeight.bold,
                                      color: const Color(0xFF7C9EFF),
                                    ),
                              ),
                            ),
                            for (final item in entry.value)
                              CheckboxListTile(
                                title: Text(
                                  item.label,
                                  style: TextStyle(
                                    decoration: item.isChecked
                                        ? TextDecoration.lineThrough
                                        : null,
                                    color: item.isChecked
                                        ? Colors.white38
                                        : Colors.white,
                                  ),
                                ),
                                value: item.isChecked,
                                activeColor: const Color(0xFF7C9EFF),
                                onChanged: (_) async {
                                  final archived = await ref
                                      .read(sessionControllerProvider)
                                      .toggleChecklistItem(item, session.id!);

                                  if (archived && context.mounted) {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      const SnackBar(
                                        content: Text(
                                          'Session completed and archived!',
                                        ),
                                      ),
                                    );
                                    Navigator.of(context).pop();
                                  }
                                },
                              ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
                Positioned(
                  left: 12,
                  right: 12,
                  bottom: 12,
                  child: GlassContainer(
                    borderRadius: 20,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 12,
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '$checked / $total checked',
                          style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            color: Colors.white,
                          ),
                        ),
                        const SizedBox(height: 6),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: LinearProgressIndicator(
                            value: progress,
                            minHeight: 8,
                            backgroundColor: Colors.white.withOpacity(0.08),
                            color: const Color(0xFF7C9EFF),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            );
          },
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, st) => Center(child: Text('Error: $e')),
        ),
      ),
    );
  }
}
