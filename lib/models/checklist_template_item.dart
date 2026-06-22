import 'package:hive/hive.dart';

part 'checklist_template_item.g.dart';

@HiveType(typeId: 2)
class ChecklistTemplateItem extends HiveObject {
  @HiveField(0)
  final String label;

  @HiveField(1)
  final String section;

  @HiveField(2)
  final int sortOrder;

  @HiveField(3)
  final String type; // 'UAP' or 'UAS'

  ChecklistTemplateItem({
    required this.label,
    required this.section,
    required this.sortOrder,
    required this.type,
  });
}
