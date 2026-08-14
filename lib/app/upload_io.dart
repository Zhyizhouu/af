import 'dart:async';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

import 'upload_types.dart';

/// Native implementation of [uploadMultipart]. See `upload.dart`.
///
/// Here counting bytes off the request stream is honest: `dart:io`'s client
/// writes them to the socket as they are pulled, so a byte counted is a byte
/// on the wire.
Future<UploadResponse> uploadMultipart({
  required Uri url,
  required Map<String, String> headers,
  required Uint8List bytes,
  required String fileName,
  required String fieldName,
  required void Function(double fraction) onProgress,
}) async {
  final client = http.Client();
  try {
    final request = _CountingRequest('POST', url, onProgress)
      ..headers.addAll(headers)
      ..files.add(http.MultipartFile.fromBytes(
        fieldName,
        bytes,
        filename: fileName,
      ));

    final streamed = await client.send(request);
    final response = await http.Response.fromStream(streamed);
    onProgress(1);
    return UploadResponse(response.statusCode, response.body);
  } finally {
    client.close();
  }
}

/// A multipart request that reports how much of itself has been read.
class _CountingRequest extends http.MultipartRequest {
  final void Function(double fraction) onProgress;

  _CountingRequest(super.method, super.url, this.onProgress);

  @override
  http.ByteStream finalize() {
    final source = super.finalize();
    // Includes the multipart framing, not just the file — which is what the
    // socket will actually carry.
    final total = contentLength;
    var sent = 0;

    return http.ByteStream(
      source.transform(
        StreamTransformer<List<int>, List<int>>.fromHandlers(
          handleData: (chunk, sink) {
            sent += chunk.length;
            if (total > 0) onProgress((sent / total).clamp(0.0, 1.0));
            sink.add(chunk);
          },
        ),
      ),
    );
  }
}
