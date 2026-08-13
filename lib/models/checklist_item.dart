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

  /// Stable cross-device identity. See [ProctorSession.syncId].
  @HiveField(5, defaultValue: '')
  String syncId;

  /// The parent's [ProctorSession.syncId].
  ///
  /// [sessionKey] stays as the local Hive-key link — the same session has a
  /// different Hive key on every device, so the sync link has to be separate.
  @HiveField(6, defaultValue: '')
  String sessionId;

  @HiveField(7)
  DateTime? updatedAt;

  @HiveField(8, defaultValue: false)
  bool deleted;

  ChecklistItem({
    required this.sessionKey,
    required this.label,
    required this.section,
    this.isChecked = false,
    required this.sortOrder,
    this.syncId = '',
    this.sessionId = '',
    this.updatedAt,
    this.deleted = false,
  });
}
