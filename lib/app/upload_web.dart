import 'dart:async';
import 'dart:js_interop';
import 'dart:typed_data';

import 'package:web/web.dart' as web;

import 'upload_types.dart';

/// Browser implementation of [uploadMultipart]. See `upload.dart`.
///
/// `XMLHttpRequest` rather than `package:http`, for one reason: its `upload`
/// object fires progress events as the browser drains its send buffer, which
/// is the only honest measure of an upload from inside a page. Everything
/// above this line — a counting stream, a wrapped sink — measures how fast
/// Dart hands bytes to the browser, which on a 200MB file finishes in a blink
/// and then leaves the bar sitting at 100% for a minute.
Future<UploadResponse> uploadMultipart({
  required Uri url,
  required Map<String, String> headers,
  required Uint8List bytes,
  required String fileName,
  required String fieldName,
  required void Function(double fraction) onProgress,
}) {
  final completer = Completer<UploadResponse>();

  final form = web.FormData();
  final blob = web.Blob(
    <JSUint8Array>[bytes.toJS].toJS,
    web.BlobPropertyBag(type: 'application/octet-stream'),
  );
  // The three-argument form is what makes this a file part rather than a text
  // field — without the filename the server sees a string, and the multipart
  // reader on the other end never finds a file to read.
  form.append(fieldName, blob, fileName);

  final request = web.XMLHttpRequest()..open('POST', url.toString());
  // Called in a loop rather than passed to forEach: dart2js rejects tearing
  // off an external interop member, and the analyzer does not catch it — only
  // the web compile does.
  for (final header in headers.entries) {
    request.setRequestHeader(header.key, header.value);
  }

  // Deliberately not setting Content-Type: the browser has to write it itself
  // so that it can append the multipart boundary it just generated.

  request.upload.addEventListener(
    'progress',
    (web.ProgressEvent event) {
      // A body of unknown length reports nothing useful; leaving the caller on
      // its last value beats flickering to zero.
      if (!event.lengthComputable || event.total == 0) return;
      onProgress((event.loaded / event.total).clamp(0.0, 1.0));
    }.toJS,
  );

  void finish(UploadResponse response) {
    if (!completer.isCompleted) completer.complete(response);
  }

  void fail(Object error) {
    if (!completer.isCompleted) completer.completeError(error);
  }

  request.addEventListener(
    'load',
    (web.Event _) {
      // The bytes are gone even if the server is unhappy; let the caller read
      // the status and decide.
      onProgress(1);
      finish(UploadResponse(request.status, request.responseText));
    }.toJS,
  );

  // A cross-origin refusal and a dead server are the same opaque event here,
  // which is why the message the caller writes has to cover both.
  request.addEventListener(
    'error',
    (web.Event _) {
      fail(StateError('the upload could not be sent'));
    }.toJS,
  );
  request.addEventListener(
    'abort',
    (web.Event _) {
      fail(StateError('the upload was cancelled'));
    }.toJS,
  );
  request.addEventListener(
    'timeout',
    (web.Event _) {
      fail(StateError('the upload timed out'));
    }.toJS,
  );

  request.send(form);
  return completer.future;
}
