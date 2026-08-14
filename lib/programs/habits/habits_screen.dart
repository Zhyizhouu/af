import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../models/habit.dart';
import '../../theme/af_breakpoints.dart';
import '../../theme/af_text.dart';
import '../../theme/af_tokens.dart';
import '../../widgets/af_button.dart';
import '../../widgets/af_panel.dart';
import '../../widgets/af_scaffold.dart';
import '../../widgets/af_text_field.dart';
import '../../widgets/af_theme_toggle.dart';
import '../calendar/event_category.dart';
import 'habit_chart.dart';
import 'habit_provider.dart';
import 'habit_range.dart';
import 'habit_time.dart';

/// The Habits program: manage what you are tracking, see the trend, and tick
/// any day in the selected range.
class HabitsScreen extends ConsumerWidget {
  const HabitsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final habits = ref.watch(habitsProvider).valueOrNull ?? const <Habit>[];
    final range = ref.watch(habitRangeProvider);
    final compact = !AFBreakpoints.isDesktop(context);

    return AFScaffold(
      title: 'reAFresh · Habits',
      tagline: 'daily marks · Jakarta time',
      maxWidth: AFScaffold.maxWideWidth,
      actions: const [AFThemeToggle()],
      footer: AFFooter(
        habits.isEmpty
            ? 'no habits yet'
            : '${habits.length} habit${habits.length == 1 ? '' : 's'} · '
                'day starts at midnight GMT+7',
        showClock: true,
      ),
      child: ListView(
        padding: const EdgeInsets.only(bottom: 8),
        children: [
          _HabitManager(habits: habits),
          const SizedBox(height: 20),
          AFPanel(
            label: 'Completion',
            countWidget: HabitRangeBar(short: compact),
            child: const SizedBox(height: 170, child: HabitChart(height: 170)),
          ),
          const SizedBox(height: 20),
          _MarksTable(habits: habits, range: range),
        ],
      ),
    );
  }
}

// ---- managing the habits themselves ----

class _HabitManager extends ConsumerWidget {
  final List<Habit> habits;

  const _HabitManager({required this.habits});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.af;

    return AFPanel(
      label: 'Habits',
      count: '${habits.length}',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (habits.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Text(
                'Nothing tracked yet. Add one below.',
                style: AFText.meta(context),
              ),
            )
          else
            for (var i = 0; i < habits.length; i++) ...[
              if (i > 0) Divider(height: 1, color: t.line),
              _HabitRow(
                habit: habits[i],
                first: i == 0,
                last: i == habits.length - 1,
              ),
            ],
          const SizedBox(height: 14),
          AFButton.ghost(
            label: 'Add habit',
            icon: Icons.add,
            expand: true,
            onPressed: () => _openEditor(context, ref, null),
          ),
        ],
      ),
    );
  }
}

class _HabitRow extends ConsumerWidget {
  final Habit habit;
  final bool first;
  final bool last;

  const _HabitRow({
    required this.habit,
    required this.first,
    required this.last,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.af;
    final controller = ref.read(habitControllerProvider);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Container(
            width: 10,
            height: 10,
            margin: const EdgeInsets.only(right: 12),
            decoration: BoxDecoration(
              color: toneAt(habit.toneIndex).resolve(context),
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          Expanded(
            child: Text(
              habit.name,
              style: AFText.body(context),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          _RowAction(
            icon: Icons.arrow_upward,
            tooltip: 'Move up',
            onPressed: first ? null : () => controller.move(habit.id, -1),
          ),
          _RowAction(
            icon: Icons.arrow_downward,
            tooltip: 'Move down',
            onPressed: last ? null : () => controller.move(habit.id, 1),
          ),
          _RowAction(
            icon: Icons.edit_outlined,
            tooltip: 'Rename',
            onPressed: () => _openEditor(context, ref, habit),
          ),
          _RowAction(
            icon: Icons.delete_outline,
            tooltip: 'Delete',
            color: t.warn,
            onPressed: () => _confirmDelete(context, ref, habit),
          ),
        ],
      ),
    );
  }
}

class _RowAction extends StatelessWidget {
  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;
  final Color? color;

  const _RowAction({
    required this.icon,
    required this.tooltip,
    required this.onPressed,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    final t = context.af;
    return Tooltip(
      message: tooltip,
      child: IconButton(
        onPressed: onPressed,
        icon: Icon(icon, size: 16),
        color: color ?? t.muted,
        // 32px keeps four actions on one row without shrinking the target
        // below what a finger can hit.
        constraints: const BoxConstraints.tightFor(width: 32, height: 32),
        padding: EdgeInsets.zero,
        splashRadius: 18,
      ),
    );
  }
}

Future<void> _openEditor(
  BuildContext context,
  WidgetRef ref,
  Habit? habit,
) async {
  final result = await showDialog<({String name, int tone})>(
    context: context,
    builder: (_) => _HabitEditorDialog(habit: habit),
  );
  if (result == null) return;

  final controller = ref.read(habitControllerProvider);
  if (habit == null) {
    await controller.create(name: result.name, toneIndex: result.tone);
  } else {
    await controller.rename(habit.id, result.name, result.tone);
  }
}

Future<void> _confirmDelete(
  BuildContext context,
  WidgetRef ref,
  Habit habit,
) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('DELETE HABIT?'),
      content: Text(
        '"${habit.name}" disappears from every day, past marks included. '
        'The days themselves are untouched.',
        style: AFText.body(context),
      ),
      actions: [
        AFButton.quiet(
          label: 'Cancel',
          onPressed: () => Navigator.of(context).pop(false),
        ),
        AFButton.danger(
          label: 'Delete',
          onPressed: () => Navigator.of(context).pop(true),
        ),
      ],
    ),
  );

  if (confirmed != true) return;
  await ref.read(habitControllerProvider).delete(habit.id);
}

class _HabitEditorDialog extends StatefulWidget {
  final Habit? habit;

  const _HabitEditorDialog({required this.habit});

  @override
  State<_HabitEditorDialog> createState() => _HabitEditorDialogState();
}

class _HabitEditorDialogState extends State<_HabitEditorDialog> {
  late final TextEditingController _name =
      TextEditingController(text: widget.habit?.name ?? '');
  late int _tone = widget.habit?.toneIndex ?? 0;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  void _submit() {
    final name = _name.text.trim();
    if (name.isEmpty) return;
    Navigator.of(context).pop((name: name, tone: _tone));
  }

  @override
  Widget build(BuildContext context) {
    final t = context.af;

    return AlertDialog(
      title: Text(widget.habit == null ? 'NEW HABIT' : 'EDIT HABIT'),
      content: SizedBox(
        width: 320,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AFTextField(
              controller: _name,
              hint: 'Read for 20 minutes',
              mono: false,
              autofocus: true,
              textCapitalization: TextCapitalization.sentences,
              onSubmitted: (_) => _submit(),
            ),
            const SizedBox(height: 16),
            Text('COLOUR', style: AFText.panelLabel(context)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (var i = 0; i < afCategoryTones.length; i++)
                  GestureDetector(
                    onTap: () => setState(() => _tone = i),
                    child: Container(
                      width: 26,
                      height: 26,
                      decoration: BoxDecoration(
                        color: toneAt(i).resolve(context),
                        borderRadius: t.borderRadius,
                        border: Border.all(
                          color: _tone == i ? t.ink : t.line,
                          width: _tone == i ? 2 : 1,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
      actions: [
        AFButton.quiet(
          label: 'Cancel',
          onPressed: () => Navigator.of(context).pop(),
        ),
        AFButton(
          label: widget.habit == null ? 'Create' : 'Save',
          onPressed: _submit,
        ),
      ],
    );
  }
}

// ---- the marks table ----

class _MarksTable extends ConsumerWidget {
  final List<Habit> habits;
  final HabitRange range;

  const _MarksTable({required this.habits, required this.range});

  static const double _nameWidth = 168;
  static const double _habitWidth = 52;
  static const double _dateWidth = 132;
  static const double _marksWidth = 74;

  static final DateFormat _date = DateFormat('MMMM d, y');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.af;
    final days = ref.watch(habitDaysProvider).valueOrNull ?? const {};
    // At midnight this rebuilds, a fresh @Today row appears at the top, and the
    // row that held it relabels itself to @Yesterday.
    final today = ref.watch(currentDayProvider);
    final keys = dayKeysFrom(today, range.days);

    final fixed = _habitWidth * habits.length + _dateWidth + _marksWidth;

    return AFPanel(
      label: 'Daily marks',
      count: '${keys.length} day${keys.length == 1 ? '' : 's'}',
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: habits.isEmpty
          ? Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: Text(
                'Add a habit to start marking days.',
                style: AFText.meta(context),
              ),
            )
          : LayoutBuilder(builder: (context, constraints) {
              // The name column takes whatever the fixed columns leave, so the
              // table fills the panel instead of stranding it on the left. Below
              // its floor the row stops shrinking and the panel scrolls.
              final nameWidth =
                  (constraints.maxWidth - fixed).clamp(_nameWidth, 460.0);

              // Wide tables scroll inside their own box rather than pushing the
              // page sideways.
              return SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: SizedBox(
                  width: nameWidth + fixed,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _HeaderRow(habits: habits, nameWidth: nameWidth),
                      Divider(height: 1, color: t.lineStrong),
                    // Capped and scrollable: a Year range is 365 rows, and
                    // building them all eagerly would stall the frame.
                      SizedBox(
                        height: (keys.length * 40.0).clamp(40.0, 460.0),
                        child: ListView.separated(
                          itemCount: keys.length,
                          separatorBuilder: (_, __) =>
                              Divider(height: 1, color: t.line),
                          itemBuilder: (context, index) => _MarksRow(
                            dayKey: keys[index],
                            today: today,
                            habits: habits,
                            nameWidth: nameWidth,
                            completed: (days[keys[index]]?.completed ??
                                    const <String>[])
                                .toSet(),
                            dateLabel: _date.format(dayFromKey(keys[index])),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            }),
    );
  }
}

class _HeaderRow extends StatelessWidget {
  final List<Habit> habits;
  final double nameWidth;

  const _HeaderRow({required this.habits, required this.nameWidth});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          SizedBox(
            width: nameWidth,
            child: Text('NAME', style: AFText.panelLabel(context)),
          ),
          for (final habit in habits)
            SizedBox(
              width: _MarksTable._habitWidth,
              child: Tooltip(
                message: habit.name,
                child: Center(
                  child: Container(
                    width: 12,
                    height: 12,
                    decoration: BoxDecoration(
                      color: toneAt(habit.toneIndex).resolve(context),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
              ),
            ),
          SizedBox(
            width: _MarksTable._dateWidth,
            child: Text('DATE', style: AFText.panelLabel(context)),
          ),
          SizedBox(
            width: _MarksTable._marksWidth,
            child: Text(
              'MARKS',
              textAlign: TextAlign.right,
              style: AFText.panelLabel(context),
            ),
          ),
        ],
      ),
    );
  }
}

class _MarksRow extends ConsumerWidget {
  final String dayKey;
  final String today;
  final List<Habit> habits;
  final double nameWidth;
  final Set<String> completed;
  final String dateLabel;

  const _MarksRow({
    required this.dayKey,
    required this.today,
    required this.habits,
    required this.nameWidth,
    required this.completed,
    required this.dateLabel,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.af;
    final live = completed.where((id) => habits.any((h) => h.id == id)).length;
    final percent = habits.isEmpty ? 0 : (live * 100 / habits.length).round();
    final label = habitDayLabel(dayKey, today: today);
    final relative = label == '@Today' || label == '@Yesterday';

    return SizedBox(
      height: 39,
      child: Row(
        children: [
          SizedBox(
            width: nameWidth,
            child: Text(
              label,
              style: AFText.mono(
                size: 12.5,
                // Today and Yesterday are the rows anyone actually ticks;
                // giving them ink makes them findable in a long table.
                color: relative ? t.ink : t.muted,
                weight: relative ? FontWeight.w700 : FontWeight.w400,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          for (final habit in habits)
            SizedBox(
              width: _MarksTable._habitWidth,
              child: Center(
                child: _MarkBox(
                  checked: completed.contains(habit.id),
                  tone: toneAt(habit.toneIndex).resolve(context),
                  label: '${habit.name}, $label',
                  onTap: () => ref
                      .read(habitControllerProvider)
                      .toggle(habit.id, dayKey),
                ),
              ),
            ),
          SizedBox(
            width: _MarksTable._dateWidth,
            child: Text(dateLabel, style: AFText.meta(context)),
          ),
          SizedBox(
            width: _MarksTable._marksWidth,
            child: Text(
              '$percent%',
              textAlign: TextAlign.right,
              style: AFText.mono(
                size: 12.5,
                color: percent == 0 ? t.muted : t.ink,
                weight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// The checklist checkbox, tinted with the habit's own colour.
class _MarkBox extends StatelessWidget {
  final bool checked;
  final Color tone;
  final String label;
  final VoidCallback onTap;

  const _MarkBox({
    required this.checked,
    required this.tone,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = context.af;

    return Semantics(
      checked: checked,
      label: label,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(2),
        child: Padding(
          padding: const EdgeInsets.all(8),
          child: Container(
            width: 18,
            height: 18,
            decoration: BoxDecoration(
              color: checked ? tone : t.sunken,
              borderRadius: BorderRadius.circular(2),
              border: Border.all(
                color: checked ? tone : t.lineStrong,
                width: 1.5,
              ),
            ),
            child: checked
                ? const Icon(Icons.check, size: 13, color: Colors.white)
                : null,
          ),
        ),
      ),
    );
  }
}
