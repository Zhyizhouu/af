import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/session_provider.dart';
import '../widgets/add_session_dialog.dart';
import '../widgets/glass_container.dart';
import '../widgets/app_background.dart';
import 'checklist_detail_screen.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sessionsAsync = ref.watch(filteredSessionsProvider);
    final filter = ref.watch(sessionFilterProvider);

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(title: const Text('AF')),
      body: AppBackground(
        child: SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 8,
                ),
                child: SegmentedButton<SessionFilter>(
                  segments: const [
                    ButtonSegment(
                      value: SessionFilter.today,
                      label: Text('Today'),
                    ),
                    ButtonSegment(
                      value: SessionFilter.upcoming,
                      label: Text('Upcoming'),
                    ),
                    ButtonSegment(
                      value: SessionFilter.archived,
                      label: Text('Archived'),
                    ),
                  ],
                  selected: {filter},
                  onSelectionChanged: (selection) {
                    ref.read(sessionFilterProvider.notifier).state =
                        selection.first;
                  },
                ),
              ),
              Expanded(
                child: sessionsAsync.when(
                  data: (sessions) {
                    if (sessions.isEmpty) {
                      final message = switch (filter) {
                        SessionFilter.today => 'No sessions today.',
                        SessionFilter.upcoming => 'No upcoming sessions.',
                        SessionFilter.archived => 'No archived sessions yet.',
                      };
                      return Center(
                        child: Text(
                          message,
                          style: const TextStyle(color: Colors.white70),
                        ),
                      );
                    }
                    return ListView.builder(
                      itemCount: sessions.length,
                      itemBuilder: (context, index) {
                        final s = sessions[index];
                        final sessionKey = s.key.toString();
                        final checklistAsync = ref.watch(
                          sessionChecklistProvider(sessionKey),
                        );

                        return checklistAsync.when(
                          data: (items) {
                            final checked = items
                                .where((i) => i.isChecked)
                                .length;
                            final total = items.length;
                            return GlassContainer(
                              margin: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 6,
                              ),
                              child: ListTile(
                                title: Text(
                                  '${s.type} - Room ${s.room}',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                subtitle: Text(
                                  '${s.dateTime.toString().substring(0, 16)}\n$checked/$total checked',
                                  style: const TextStyle(color: Colors.white60),
                                ),
                                isThreeLine: true,
                                trailing: const Icon(
                                  Icons.chevron_right,
                                  color: Colors.white54,
                                ),
                                onTap: () {
                                  Navigator.of(context).push(
                                    MaterialPageRoute(
                                      builder: (context) =>
                                          ChecklistDetailScreen(session: s),
                                    ),
                                  );
                                },
                              ),
                            );
                          },
                          loading: () =>
                              const ListTile(title: Text('Loading...')),
                          error: (e, st) => ListTile(title: Text('Error: $e')),
                        );
                      },
                    );
                  },
                  loading: () =>
                      const Center(child: CircularProgressIndicator()),
                  error: (e, st) => Center(child: Text('Error: $e')),
                ),
              ),
            ],
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          showDialog(
            context: context,
            builder: (context) => const AddSessionDialog(),
          );
        },
        child: const Icon(Icons.add),
      ),
    );
  }
}
