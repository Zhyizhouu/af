import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../theme/af_text.dart';
import '../../theme/af_tokens.dart';
import '../../widgets/af_button.dart';
import '../../widgets/af_field.dart';
import '../../widgets/af_text_field.dart';
import 'category_provider.dart';
import 'event_category.dart';

/// Selectable category chips plus a "New" affordance.
class CategoryPicker extends ConsumerWidget {
  final String selectedSlug;
  final ValueChanged<String> onChanged;

  const CategoryPicker({
    super.key,
    required this.selectedSlug,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.af;
    final categories =
        ref.watch(categoriesProvider).valueOrNull ?? builtInCategories;

    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final category in categories)
          _CategoryChip(
            category: category,
            selected: category.slug == selectedSlug,
            onTap: () => onChanged(category.slug),
            onLongPress: category.builtIn
                ? null
                : () => _manage(context, ref, category),
          ),
        _NewChip(
          onTap: () async {
            final created = await showDialog<EventCategory>(
              context: context,
              builder: (_) => const CategoryEditorDialog(),
            );
            if (created != null) onChanged(created.slug);
          },
        ),
        // Only surfaced once a custom category exists — otherwise it is a
        // hint about a gesture with nothing to act on.
        if (categories.any((category) => !category.builtIn))
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(
              'long-press a custom category to edit',
              style: AFText.mono(size: 10.5, color: t.muted),
            ),
          ),
      ],
    );
  }

  Future<void> _manage(
    BuildContext context,
    WidgetRef ref,
    EventCategory category,
  ) async {
    final result = await showDialog<EventCategory>(
      context: context,
      builder: (_) => CategoryEditorDialog(existing: category),
    );
    // Deleting returns the fallback, so the event does not keep pointing at
    // something that no longer exists.
    if (result != null) onChanged(result.slug);
  }
}

class _CategoryChip extends StatelessWidget {
  final EventCategory category;
  final bool selected;
  final VoidCallback onTap;
  final VoidCallback? onLongPress;

  const _CategoryChip({
    required this.category,
    required this.selected,
    required this.onTap,
    this.onLongPress,
  });

  @override
  Widget build(BuildContext context) {
    final t = context.af;
    final color = category.color(context);

    return GestureDetector(
      onTap: onTap,
      onLongPress: onLongPress,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
        decoration: BoxDecoration(
          color: selected ? color.withValues(alpha: 0.14) : t.sunken,
          borderRadius: t.borderRadius,
          border: Border.all(
            color: selected ? color : t.lineStrong,
            width: selected ? 1.5 : 1,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            CategoryDot(category: category, size: 9),
            const SizedBox(width: 7),
            Text(
              category.label,
              style: AFText.mono(
                size: 12,
                color: selected ? t.ink : t.muted,
                weight: selected ? FontWeight.w700 : FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _NewChip extends StatelessWidget {
  final VoidCallback onTap;

  const _NewChip({required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = context.af;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
        decoration: BoxDecoration(
          borderRadius: t.borderRadius,
          border: Border.all(color: t.lineStrong),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.add, size: 13, color: t.accent),
            const SizedBox(width: 5),
            Text(
              'New',
              style: AFText.mono(
                size: 12,
                color: t.accent,
                weight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Create, rename or delete a custom category.
///
/// Returns the affected category on save, or [fallbackCategory] on delete so
/// the caller can move the event off a slug that no longer resolves.
class CategoryEditorDialog extends ConsumerStatefulWidget {
  final EventCategory? existing;

  const CategoryEditorDialog({super.key, this.existing});

  @override
  ConsumerState<CategoryEditorDialog> createState() =>
      _CategoryEditorDialogState();
}

class _CategoryEditorDialogState extends ConsumerState<CategoryEditorDialog> {
  late final TextEditingController _label =
      TextEditingController(text: widget.existing?.label ?? '');
  late int _toneIndex = widget.existing?.toneIndex ?? 1;

  String? _error;

  @override
  void dispose() {
    _label.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final label = _label.text.trim();
    if (label.isEmpty) {
      setState(() => _error = 'Give the category a name.');
      return;
    }

    final controller = ref.read(categoryControllerProvider);
    final existing = widget.existing;

    if (existing == null) {
      final created =
          await controller.create(label: label, toneIndex: _toneIndex);
      if (mounted) Navigator.of(context).pop(created);
      return;
    }

    await controller.rename(existing.slug, label, _toneIndex);
    if (mounted) {
      Navigator.of(context).pop(
        EventCategory(
          slug: existing.slug,
          label: label,
          toneIndex: _toneIndex,
        ),
      );
    }
  }

  Future<void> _delete() async {
    final existing = widget.existing;
    if (existing == null) return;
    await ref.read(categoryControllerProvider).delete(existing.slug);
    if (mounted) Navigator.of(context).pop(fallbackCategory);
  }

  @override
  Widget build(BuildContext context) {
    final t = context.af;
    final editing = widget.existing != null;

    return AlertDialog(
      title: Text(editing ? 'EDIT CATEGORY' : 'NEW CATEGORY'),
      content: SizedBox(
        width: 340,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            AFField(
              label: 'Name',
              topSpacing: 4,
              child: AFTextField(
                controller: _label,
                mono: false,
                hint: 'Gym, Family, Side project…',
                autofocus: !editing,
                textCapitalization: TextCapitalization.words,
              ),
            ),
            AFField(
              label: 'Colour',
              value: toneAt(_toneIndex).name,
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (var i = 0; i < afCategoryTones.length; i++)
                    GestureDetector(
                      onTap: () => setState(() => _toneIndex = i),
                      child: Container(
                        width: 28,
                        height: 28,
                        decoration: BoxDecoration(
                          color: afCategoryTones[i].resolve(context),
                          borderRadius: BorderRadius.circular(2),
                          border: Border.all(
                            color: _toneIndex == i ? t.ink : t.lineStrong,
                            width: _toneIndex == i ? 2 : 1,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            if (_error != null) AFHint(_error!),
          ],
        ),
      ),
      actions: [
        if (editing) AFButton.danger(label: 'Delete', onPressed: _delete),
        AFButton.quiet(
          label: 'Cancel',
          onPressed: () => Navigator.of(context).pop(),
        ),
        AFButton(label: editing ? 'Save' : 'Create', onPressed: _save),
      ],
    );
  }
}
