import 'dart:js_interop';

import 'package:flutter/foundation.dart';
import 'package:web/web.dart' as web;

/// Browser implementation of [deliverFile]. See `file_delivery.dart`.
///
/// Goes straight to a download rather than the Web Share API: sharing files
/// from the browser needs a secure context, a user gesture and per-browser
/// support for the file type, whereas an object-URL download works everywhere
/// and is what "Save PNG" implies anyway.
Future<String?> deliverFile({
  required Uint8List bytes,
  required String fileName,
  required String mimeType,
  bool forceShare = false,
}) async {
  final blob = web.Blob(
    <JSUint8Array>[bytes.toJS].toJS,
    web.BlobPropertyBag(type: mimeType),
  );

  final url = web.URL.createObjectURL(blob);
  final anchor = web.document.createElement('a') as web.HTMLAnchorElement
    ..href = url
    ..download = fileName
    ..style.display = 'none';

  web.document.body?.appendChild(anchor);
  anchor.click();
  anchor.remove();
  web.URL.revokeObjectURL(url);

  return 'Downloaded $fileName';
}
