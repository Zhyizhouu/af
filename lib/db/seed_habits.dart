import 'package:uuid/uuid.dart';

import '../models/habit.dart';
import 'database_helper.dart';

const _uuid = Uuid();

/// Gives a brand-new install one habit to tick, so the tracker opens with
/// something in it rather than an empty table and a shrug.
///
/// Guarded on the box being empty rather than on the live list, so deleting the
/// starter habit is respected — the tombstone keeps the box non-empty and this
/// never puts it back.
Future<void> seedHabitsIfEmpty() async {
  final db = DatabaseHelper.instance;
  if (db.habitsBox.isNotEmpty) return;

  final now = DateTime.now();
  await db.putHabit(
    Habit(
      id: _uuid.v4(),
      name: 'Read',
      toneIndex: 0,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    ),
  );
}
