import 'package:af/models/proctor_session..dart';
import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';
import '../models/checklist_item.dart';
import '../models/checklist_template_item.dart';

class DatabaseHelper {
  static final DatabaseHelper instance = DatabaseHelper._init();
  static Database? _database;

  DatabaseHelper._init();

  Future<Database> get database async {
    if (_database != null) return _database!;
    _database = await _initDB('af_app.db');
    return _database!;
  }

  Future<Database> _initDB(String fileName) async {
    final dbPath = await getDatabasesPath();
    final path = join(dbPath, fileName);
    return await openDatabase(
      path,
      version: 2,
      onCreate: _createDB,
      onUpgrade: _upgradeDB,
    );
  }

  Future _createDB(Database db, int version) async {
    await db.execute('''
      CREATE TABLE checklist_template (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT NOT NULL,
        section TEXT NOT NULL,
        sort_order INTEGER NOT NULL
      )
    ''');

    await db.execute('''
      CREATE TABLE proctor_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        date_time TEXT NOT NULL,
        room TEXT NOT NULL,
        course_code TEXT NOT NULL DEFAULT "",
        course_name TEXT NOT NULL DEFAULT "",
        course_class TEXT NOT NULL DEFAULT "",
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL
      )
    ''');

    await db.execute('''
      CREATE TABLE checklist_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        label TEXT NOT NULL,
        section TEXT NOT NULL,
        is_checked INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES proctor_sessions (id) ON DELETE CASCADE
      )
    ''');

    await db.execute('''
      CREATE TABLE frequent_courses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_code TEXT NOT NULL,
        course_name TEXT NOT NULL,
        course_class TEXT NOT NULL,
        UNIQUE(course_code, course_name, course_class)
      )
    ''');
  }

  Future _upgradeDB(Database db, int oldVersion, int newVersion) async {
    if (oldVersion < 2) {
      await db.execute(
        'ALTER TABLE proctor_sessions ADD COLUMN course_code TEXT NOT NULL DEFAULT ""',
      );
      await db.execute(
        'ALTER TABLE proctor_sessions ADD COLUMN course_name TEXT NOT NULL DEFAULT ""',
      );
      await db.execute(
        'ALTER TABLE proctor_sessions ADD COLUMN course_class TEXT NOT NULL DEFAULT ""',
      );

      // checklist_template and checklist_items need a 'section' column
      await db.execute(
        'ALTER TABLE checklist_template ADD COLUMN section TEXT NOT NULL DEFAULT ""',
      );
      await db.execute(
        'ALTER TABLE checklist_items ADD COLUMN section TEXT NOT NULL DEFAULT ""',
      );

      await db.execute('''
        CREATE TABLE frequent_courses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          course_code TEXT NOT NULL,
          course_name TEXT NOT NULL,
          course_class TEXT NOT NULL,
          UNIQUE(course_code, course_name, course_class)
        )
      ''');
    }
  }

  // ---- Template ----
  Future<int> insertTemplateItem(ChecklistTemplateItem item) async {
    final db = await instance.database;
    return await db.insert('checklist_template', item.toMap());
  }

  Future<List<ChecklistTemplateItem>> getTemplate() async {
    final db = await instance.database;
    final result = await db.query(
      'checklist_template',
      orderBy: 'sort_order ASC',
    );
    return result.map((e) => ChecklistTemplateItem.fromMap(e)).toList();
  }

  Future<int> deleteTemplateItem(int id) async {
    final db = await instance.database;
    return await db.delete(
      'checklist_template',
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  Future<int> clearTemplate() async {
    final db = await instance.database;
    return await db.delete('checklist_template');
  }

  // ---- Sessions ----
  Future<int> insertSession(ProctorSession session) async {
    final db = await instance.database;
    return await db.insert('proctor_sessions', session.toMap());
  }

  Future<List<ProctorSession>> getSessions(String status) async {
    final db = await instance.database;
    final result = await db.query(
      'proctor_sessions',
      where: 'status = ?',
      whereArgs: [status],
      orderBy: 'date_time ASC',
    );
    return result.map((e) => ProctorSession.fromMap(e)).toList();
  }

  Future<int> updateSessionStatus(int id, String status) async {
    final db = await instance.database;
    return await db.update(
      'proctor_sessions',
      {'status': status},
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  // ---- Checklist items ----
  Future<int> insertChecklistItem(ChecklistItem item) async {
    final db = await instance.database;
    return await db.insert('checklist_items', item.toMap());
  }

  Future<List<ChecklistItem>> getChecklistItems(int sessionId) async {
    final db = await instance.database;
    final result = await db.query(
      'checklist_items',
      where: 'session_id = ?',
      whereArgs: [sessionId],
      orderBy: 'sort_order ASC',
    );
    return result.map((e) => ChecklistItem.fromMap(e)).toList();
  }

  Future<int> updateChecklistItem(ChecklistItem item) async {
    final db = await instance.database;
    return await db.update(
      'checklist_items',
      item.toMap(),
      where: 'id = ?',
      whereArgs: [item.id],
    );
  }

  // ---- Frequent Courses ----
  Future<int> insertFrequentCourse(
    String code,
    String name,
    String courseClass,
  ) async {
    final db = await instance.database;
    return await db.insert('frequent_courses', {
      'course_code': code,
      'course_name': name,
      'course_class': courseClass,
    }, conflictAlgorithm: ConflictAlgorithm.ignore);
  }

  Future<List<Map<String, dynamic>>> getFrequentCourses() async {
    final db = await instance.database;
    return await db.query('frequent_courses', orderBy: 'id DESC');
  }

  Future<int> deleteFrequentCourse(int id) async {
    final db = await instance.database;
    return await db.delete(
      'frequent_courses',
      where: 'id = ?',
      whereArgs: [id],
    );
  }
}
