// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ai_conversation.dart';

// **************************************************************************
// TypeAdapterGenerator
// **************************************************************************

class AiConversationAdapter extends TypeAdapter<AiConversation> {
  @override
  final int typeId = 8;

  @override
  AiConversation read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };
    return AiConversation(
      id: fields[0] as String,
      title: fields[1] as String,
      turns: (fields[2] as List).cast<String>(),
      createdAt: fields[3] as DateTime,
      updatedAt: fields[4] as DateTime,
      deleted: fields[5] as bool,
    );
  }

  @override
  void write(BinaryWriter writer, AiConversation obj) {
    writer
      ..writeByte(6)
      ..writeByte(0)
      ..write(obj.id)
      ..writeByte(1)
      ..write(obj.title)
      ..writeByte(2)
      ..write(obj.turns)
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
      other is AiConversationAdapter &&
          runtimeType == other.runtimeType &&
          typeId == other.typeId;
}
