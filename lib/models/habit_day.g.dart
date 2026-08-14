// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'habit_day.dart';

// **************************************************************************
// TypeAdapterGenerator
// **************************************************************************

class HabitDayAdapter extends TypeAdapter<HabitDay> {
  @override
  final int typeId = 7;

  @override
  HabitDay read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };
    return HabitDay(
      day: fields[0] as String,
      completed: (fields[1] as List).cast<String>(),
      updatedAt: fields[2] as DateTime,
    );
  }

  @override
  void write(BinaryWriter writer, HabitDay obj) {
    writer
      ..writeByte(3)
      ..writeByte(0)
      ..write(obj.day)
      ..writeByte(1)
      ..write(obj.completed)
      ..writeByte(2)
      ..write(obj.updatedAt);
  }

  @override
  int get hashCode => typeId.hashCode;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is HabitDayAdapter &&
          runtimeType == other.runtimeType &&
          typeId == other.typeId;
}
