import 'package:hive/hive.dart';

part 'checklist_item.g.dart';

@HiveType(typeId: 1)
class ChecklistItem extends HiveObject {
  @HiveField(0)
  final String sessionKey; // Hive key of the parent ProctorSession

  @HiveField(1)
  final String label;

  @HiveField(2)
  final String section;

  @HiveField(3)
  bool isChecked;

  @HiveField(4)
  final int sortOrder;

  ChecklistItem({
    required this.sessionKey,
    required this.label,
    required this.section,
    this.isChecked = false,
    required this.sortOrder,
  });
}
