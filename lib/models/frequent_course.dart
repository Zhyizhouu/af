import 'package:hive/hive.dart';

part 'frequent_course.g.dart';

@HiveType(typeId: 3)
class FrequentCourse extends HiveObject {
  @HiveField(0)
  final String courseCode;

  @HiveField(1)
  final String courseName;

  @HiveField(2)
  final String courseClass;

  FrequentCourse({
    required this.courseCode,
    required this.courseName,
    required this.courseClass,
  });
}
