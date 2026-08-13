import 'package:hive/hive.dart';

part 'custom_category.g.dart';

/// A category the user created, alongside the built-in ones.
///
/// Sync-shaped from the start, like [CalendarEvent]: UUID identity,
/// `updatedAt` for last-write-wins, and a tombstone so a deletion propagates
/// rather than being resurrected by another device.
@HiveType(typeId: 5)
class CustomCategory extends HiveObject {
  @HiveField(0)
  final String id;

  @HiveField(1)
  String label;

  /// Index into `afCategoryTones`, not a raw colour — see `CategoryTone`.
  @HiveField(2)
  int toneIndex;

  @HiveField(3)
  final DateTime createdAt;

  @HiveField(4)
  DateTime updatedAt;

  @HiveField(5)
  bool deleted;

  CustomCategory({
    required this.id,
    required this.label,
    required this.toneIndex,
    required this.createdAt,
    required this.updatedAt,
    this.deleted = false,
  });
}
