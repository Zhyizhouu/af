import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

/// Native implementation of [deliverFile]. See `qr_export.dart`.
///
/// Desktop gets a real save dialog; mobile has no writable user-visible
/// filesystem to target, so the file goes through the share sheet, which is
/// where "Save to Files" and "Save to Photos" live anyway.
Future<String?> deliverFile({
  required Uint8List bytes,
  required String fileName,
  required String mimeType,
  bool forceShare = false,
}) async {
  final isDesktop =
      defaultTargetPlatform == TargetPlatform.windows ||
      defaultTargetPlatform == TargetPlatform.macOS ||
      defaultTargetPlatform == TargetPlatform.linux;

  if (isDesktop && !forceShare) {
    final extension = fileName.split('.').last;
    final path = await FilePicker.platform.saveFile(
      dialogTitle: 'Save $fileName',
      fileName: fileName,
      type: FileType.custom,
      allowedExtensions: [extension],
    );
    if (path == null) return null;

    // The dialog does not always append the extension the filter implies.
    final target = path.toLowerCase().endsWith('.$extension')
        ? path
        : '$path.$extension';
    await File(target).writeAsBytes(bytes);
    return 'Saved ${target.split(Platform.pathSeparator).last}';
  }

  final directory = await getTemporaryDirectory();
  final file = File('${directory.path}${Platform.pathSeparator}$fileName');
  await file.writeAsBytes(bytes);

  final result = await SharePlus.instance.share(
    ShareParams(
      files: [XFile(file.path, mimeType: mimeType, name: fileName)],
      fileNameOverrides: [fileName],
    ),
  );

  return switch (result.status) {
    ShareResultStatus.success => 'Shared $fileName',
    ShareResultStatus.dismissed => null,
    ShareResultStatus.unavailable => 'Sharing is unavailable here',
  };
}
