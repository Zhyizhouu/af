import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../db/database_helper.dart';
import '../../models/custom_category.dart';
import '../../sync/sync_controller.dart';
import 'event_category.dart';

const _uuid = Uuid();

/// Built-in categories plus anything the user created, in one list.
///
/// Built-ins lead so the common classifications stay in a stable position as
/// custom ones accumulate.
final categoriesProvider = FutureProvider<List<EventCategory>>((ref) async {
  final custom = DatabaseHelper.instance.getCustomCategories();
  return [
    ...builtInCategories,
    for (final category in custom)
      EventCategory(
        slug: category.id,
        label: category.label,
        toneIndex: category.toneIndex,
      ),
  ];
});

/// Slug to category, falling back to "Other" for a slug that no longer
/// resolves — a category deleted while events still referenced it.
final categoryLookupProvider =
    FutureProvider<Map<String, EventCategory>>((ref) async {
  final categories = await ref.watch(categoriesProvider.future);
  return {for (final category in categories) category.slug: category};
});

class CategoryController {
  final Ref ref;

  CategoryController(this.ref);

  Future<EventCategory> create({
    required String label,
    required int toneIndex,
  }) async {
    final now = DateTime.now();
    final category = CustomCategory(
      id: _uuid.v4(),
      label: label.trim(),
      toneIndex: toneIndex,
      createdAt: now,
      updatedAt: now,
    );

    await DatabaseHelper.instance.putCustomCategory(category);
    ref.invalidate(categoriesProvider);
    ref.read(syncControllerProvider.notifier).requestSync();

    return EventCategory(
      slug: category.id,
      label: category.label,
      toneIndex: category.toneIndex,
    );
  }

  Future<void> rename(String id, String label, int toneIndex) async {
    final category = DatabaseHelper.instance.customCategoriesBox.get(id);
    if (category == null) return;
    category
      ..label = label.trim()
      ..toneIndex = toneIndex
      ..updatedAt = DateTime.now();
    await category.save();

    ref.invalidate(categoriesProvider);
    ref.read(syncControllerProvider.notifier).requestSync();
  }

  /// Built-ins cannot be deleted; events referencing a deleted custom category
  /// fall back to "Other" rather than losing their colour entirely.
  Future<void> delete(String id) async {
    await DatabaseHelper.instance.deleteCustomCategory(id);
    ref.invalidate(categoriesProvider);
    ref.read(syncControllerProvider.notifier).requestSync();
  }
}

final categoryControllerProvider =
    Provider((ref) => CategoryController(ref));
