class ProctorSession {
  final int? id;
  final String type;
  final DateTime dateTime;
  final String room;
  final String courseCode;
  final String courseName;
  final String courseClass;
  final String status;
  final DateTime createdAt;

  ProctorSession({
    this.id,
    required this.type,
    required this.dateTime,
    required this.room,
    required this.courseCode,
    required this.courseName,
    required this.courseClass,
    this.status = 'active',
    required this.createdAt,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'type': type,
      'date_time': dateTime.toIso8601String(),
      'room': room,
      'course_code': courseCode,
      'course_name': courseName,
      'course_class': courseClass,
      'status': status,
      'created_at': createdAt.toIso8601String(),
    };
  }

  factory ProctorSession.fromMap(Map<String, dynamic> map) {
    return ProctorSession(
      id: map['id'],
      type: map['type'],
      dateTime: DateTime.parse(map['date_time']),
      room: map['room'],
      courseCode: map['course_code'] ?? '',
      courseName: map['course_name'] ?? '',
      courseClass: map['course_class'] ?? '',
      status: map['status'],
      createdAt: DateTime.parse(map['created_at']),
    );
  }
}
