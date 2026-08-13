// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'checklist_item.dart';

// **************************************************************************
// TypeAdapterGenerator
// **************************************************************************

class ChecklistItemAdapter extends TypeAdapter<ChecklistItem> {
  @override
  final int typeId = 1;

  @override
  ChecklistItem read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };
    return ChecklistItem(
      sessionKey: fields[0] as String,
      label: fields[1] as String,
      section: fields[2] as String,
      isChecked: fields[3] as bool,
      sortOrder: fields[4] as int,
      syncId: fields[5] == null ? '' : fields[5] as String,
      sessionId: fields[6] == null ? '' : fields[6] as String,
      updatedAt: fields[7] as DateTime?,
      deleted: fields[8] == null ? false : fields[8] as bool,
    );
  }

  @override
  void write(BinaryWriter writer, ChecklistItem obj) {
    writer
      ..writeByte(9)
      ..writeByte(0)
      ..write(obj.sessionKey)
      ..writeByte(1)
      ..write(obj.label)
      ..writeByte(2)
      ..write(obj.section)
      ..writeByte(3)
      ..write(obj.isChecked)
      ..writeByte(4)
      ..write(obj.sortOrder)
      ..writeByte(5)
      ..write(obj.syncId)
      ..writeByte(6)
      ..write(obj.sessionId)
      ..writeByte(7)
      ..write(obj.updatedAt)
      ..writeByte(8)
      ..write(obj.deleted);
  }

  @override
  int get hashCode => typeId.hashCode;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ChecklistItemAdapter &&
          runtimeType == other.runtimeType &&
          typeId == other.typeId;
}
