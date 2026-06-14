import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../db/database_helper.dart';
import '../models/checklist_template_item.dart';

final templateProvider = FutureProvider<List<ChecklistTemplateItem>>((
  ref,
) async {
  return DatabaseHelper.instance.getTemplate();
});

class TemplateController {
  final Ref ref;
  TemplateController(this.ref);

  Future<void> addItem(String label, String section) async {
    final db = DatabaseHelper.instance;
    final current = await db.getTemplate();
    final newSortOrder = current.isEmpty ? 0 : current.last.sortOrder + 1;
    await db.insertTemplateItem(
      ChecklistTemplateItem(
        label: label,
        section: section,
        sortOrder: newSortOrder,
      ),
    );
    ref.invalidate(templateProvider);
  }

  Future<void> removeItem(int id) async {
    final db = DatabaseHelper.instance;
    await db.deleteTemplateItem(id);
    ref.invalidate(templateProvider);
  }
}

final templateControllerProvider = Provider((ref) => TemplateController(ref));
