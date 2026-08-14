/// Uploads a file and reports progress while it goes.
///
/// The two platforms need genuinely different implementations, not a shared
/// one with a flag. On web, `package:http` goes through `XMLHttpRequest` and
/// hands it the whole body at once, so counting bytes as they leave Dart
/// measures nothing — the counter would race to 100% and then the browser
/// would spend a minute actually sending. Only the browser knows how much has
/// gone, and only `XMLHttpRequest.upload`'s progress event reports it.
///
/// Native builds have no such problem and count bytes off the request stream.
///
/// ```dart
/// Future<UploadResponse> uploadMultipart({
///   required Uri url,
///   required Map<String, String> headers,
///   required Uint8List bytes,
///   required String fileName,
///   required String fieldName,
///   required void Function(double fraction) onProgress,
/// });
/// ```
library;

export 'upload_types.dart';
export 'upload_io.dart' if (dart.library.js_interop) 'upload_web.dart';
