import 'dart:typed_data';

/// What an upload came back with. Deliberately not `http.Response`: the web
/// implementation does not use `package:http` at all.
class UploadResponse {
  final int statusCode;
  final String body;

  const UploadResponse(this.statusCode, this.body);

  bool get ok => statusCode >= 200 && statusCode < 300;
}

/// Sends one file as `multipart/form-data`, reporting how much has gone.
///
/// Injectable so tests can drive the flow without a network, and so the two
/// platform implementations can differ completely — see `upload.dart`.
typedef Uploader = Future<UploadResponse> Function({
  required Uri url,
  required Map<String, String> headers,
  required Uint8List bytes,
  required String fileName,
  required String fieldName,
  required void Function(double fraction) onProgress,
});
