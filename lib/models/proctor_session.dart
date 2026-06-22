import 'package:hive/hive.dart';

part 'proctor_session.g.dart';

@HiveType(typeId: 0)
class ProctorSession extends HiveObject {
  @HiveField(0)
  final String type;

  @HiveField(1)
  final DateTime dateTime;

  @HiveField(2)
  final String room;

  @HiveField(3)
  final String courseCode;

  @HiveField(4)
  final String courseName;

  @HiveField(5)
  final String courseClass;

  @HiveField(6)
  String status;

  @HiveField(7)
  final DateTime createdAt;

  ProctorSession({
    required this.type,
    required this.dateTime,
    required this.room,
    required this.courseCode,
    required this.courseName,
    required this.courseClass,
    this.status = 'active',
    required this.createdAt,
  });
}
