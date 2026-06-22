import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../db/database_helper.dart';
import '../models/checklist_template_item.dart';

final templateProvider =
    FutureProvider.family<List<ChecklistTemplateItem>, String>((
      ref,
      type,
    ) async {
      return DatabaseHelper.instance.getTemplate(type: type);
    });

class TemplateController {
  final Ref ref;
  TemplateController(this.ref);

  Future<void> addItem(String label, String section, String type) async {
    final db = DatabaseHelper.instance;
    final current = db.getTemplate(type: type);
    final newSortOrder = current.isEmpty ? 0 : current.last.sortOrder + 1;
    await db.insertTemplateItem(
      ChecklistTemplateItem(
        label: label,
        section: section,
        sortOrder: newSortOrder,
        type: type,
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
