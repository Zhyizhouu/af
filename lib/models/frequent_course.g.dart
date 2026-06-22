// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'frequent_course.dart';

// **************************************************************************
// TypeAdapterGenerator
// **************************************************************************

class FrequentCourseAdapter extends TypeAdapter<FrequentCourse> {
  @override
  final int typeId = 3;

  @override
  FrequentCourse read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };
    return FrequentCourse(
      courseCode: fields[0] as String,
      courseName: fields[1] as String,
      courseClass: fields[2] as String,
    );
  }

  @override
  void write(BinaryWriter writer, FrequentCourse obj) {
    writer
      ..writeByte(3)
      ..writeByte(0)
      ..write(obj.courseCode)
      ..writeByte(1)
      ..write(obj.courseName)
      ..writeByte(2)
      ..write(obj.courseClass);
  }

  @override
  int get hashCode => typeId.hashCode;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is FrequentCourseAdapter &&
          runtimeType == other.runtimeType &&
          typeId == other.typeId;
}
