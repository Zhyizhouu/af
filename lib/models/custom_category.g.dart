// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'custom_category.dart';

// **************************************************************************
// TypeAdapterGenerator
// **************************************************************************

class CustomCategoryAdapter extends TypeAdapter<CustomCategory> {
  @override
  final int typeId = 5;

  @override
  CustomCategory read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };
    return CustomCategory(
      id: fields[0] as String,
      label: fields[1] as String,
      toneIndex: fields[2] as int,
      createdAt: fields[3] as DateTime,
      updatedAt: fields[4] as DateTime,
      deleted: fields[5] as bool,
    );
  }

  @override
  void write(BinaryWriter writer, CustomCategory obj) {
    writer
      ..writeByte(6)
      ..writeByte(0)
      ..write(obj.id)
      ..writeByte(1)
      ..write(obj.label)
      ..writeByte(2)
      ..write(obj.toneIndex)
      ..writeByte(3)
      ..write(obj.createdAt)
      ..writeByte(4)
      ..write(obj.updatedAt)
      ..writeByte(5)
      ..write(obj.deleted);
  }

  @override
  int get hashCode => typeId.hashCode;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is CustomCategoryAdapter &&
          runtimeType == other.runtimeType &&
          typeId == other.typeId;
}
