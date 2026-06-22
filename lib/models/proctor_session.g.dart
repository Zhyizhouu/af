// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'proctor_session.dart';

// **************************************************************************
// TypeAdapterGenerator
// **************************************************************************

class ProctorSessionAdapter extends TypeAdapter<ProctorSession> {
  @override
  final int typeId = 0;

  @override
  ProctorSession read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };
    return ProctorSession(
      type: fields[0] as String,
      dateTime: fields[1] as DateTime,
      room: fields[2] as String,
      courseCode: fields[3] as String,
      courseName: fields[4] as String,
      courseClass: fields[5] as String,
      status: fields[6] as String,
      createdAt: fields[7] as DateTime,
    );
  }

  @override
  void write(BinaryWriter writer, ProctorSession obj) {
    writer
      ..writeByte(8)
      ..writeByte(0)
      ..write(obj.type)
      ..writeByte(1)
      ..write(obj.dateTime)
      ..writeByte(2)
      ..write(obj.room)
      ..writeByte(3)
      ..write(obj.courseCode)
      ..writeByte(4)
      ..write(obj.courseName)
      ..writeByte(5)
      ..write(obj.courseClass)
      ..writeByte(6)
      ..write(obj.status)
      ..writeByte(7)
      ..write(obj.createdAt);
  }

  @override
  int get hashCode => typeId.hashCode;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ProctorSessionAdapter &&
          runtimeType == other.runtimeType &&
          typeId == other.typeId;
}
