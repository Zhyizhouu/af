/// Hands a generated file to the user, however this platform does that.
///
/// Native builds save through a file dialog or the share sheet; web builds
/// trigger a browser download. Flutter's web SDK ships a `dart:io` shim that
/// *compiles* but throws at runtime, so the split has to happen here at
/// import time rather than behind a `kIsWeb` check.
///
/// Returns a short status line for the toast, or null if the user backed out.
///
/// ```dart
/// Future<String?> deliverFile({
///   required Uint8List bytes,
///   required String fileName,
///   required String mimeType,
///   bool forceShare = false,
/// });
/// ```
library;

export 'qr_export_io.dart'
    if (dart.library.js_interop) 'qr_export_web.dart';
