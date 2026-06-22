// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'checklist_template_item.dart';

// **************************************************************************
// TypeAdapterGenerator
// **************************************************************************

class ChecklistTemplateItemAdapter extends TypeAdapter<ChecklistTemplateItem> {
  @override
  final int typeId = 2;

  @override
  ChecklistTemplateItem read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };
    return ChecklistTemplateItem(
      label: fields[0] as String,
      section: fields[1] as String,
      sortOrder: fields[2] as int,
      type: fields[3] as String,
    );
  }

  @override
  void write(BinaryWriter writer, ChecklistTemplateItem obj) {
    writer
      ..writeByte(4)
      ..writeByte(0)
      ..write(obj.label)
      ..writeByte(1)
      ..write(obj.section)
      ..writeByte(2)
      ..write(obj.sortOrder)
      ..writeByte(3)
      ..write(obj.type);
  }

  @override
  int get hashCode => typeId.hashCode;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ChecklistTemplateItemAdapter &&
          runtimeType == other.runtimeType &&
          typeId == other.typeId;
}
