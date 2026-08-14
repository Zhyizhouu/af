import 'dart:convert';
import 'dart:typed_data';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;

/// Where the converter lives.
///
/// Overridden at build time, because the API is a container somewhere and the
/// app is a static bundle on Vercel — they never share an origin:
///
/// ```
/// flutter build web --release \
///   --dart-define=AF_CONVERT_API=https://convert.example.com
/// ```
const String kConvertApiBase = String.fromEnvironment(
  'AF_CONVERT_API',
  defaultValue: 'http://localhost:8080',
);

/// A failure worth showing somebody, as opposed to a stack trace.
class AudioError implements Exception {
  final String message;

  /// True when the job is gone rather than broken — an expired result, or one
  /// this account does not own. The UI clears the job instead of offering a
  /// retry that cannot work.
  final bool gone;

  const AudioError(this.message, {this.gone = false});

  @override
  String toString() => message;
}

/// One output format the converter produces.
///
/// Read from the server rather than listed here: which codecs exist is a
/// property of the worker's ffmpeg build, and a client-side list would go
/// stale the moment that image changes.
class AudioFormat {
  final String id;
  final String label;
  final String extension;

  /// Lossy formats take a bitrate. For the rest the control is hidden rather
  /// than shown doing nothing.
  final bool lossy;

  /// Bitrates this codec accepts, or empty for the server's common set.
  ///
  /// Not decoration: libopus refuses anything above 256k and fails the whole
  /// conversion rather than clamping, so offering 320 for it would be
  /// offering a setting that cannot work.
  final List<int> bitrates;

  /// The one thing worth knowing before picking this format.
  final String note;

  const AudioFormat({
    required this.id,
    required this.label,
    required this.extension,
    required this.lossy,
    required this.note,
    this.bitrates = const [],
  });

  factory AudioFormat.fromJson(Map<String, dynamic> json) => AudioFormat(
        id: json['id'] as String? ?? '',
        label: json['label'] as String? ?? '',
        extension: json['extension'] as String? ?? '',
        lossy: json['lossy'] as bool? ?? false,
        bitrates: (json['bitrates'] as List?)
                ?.map((b) => (b as num).toInt())
                .toList() ??
            const [],
        note: json['note'] as String? ?? '',
      );
}

/// What the server will accept.
class AudioLimits {
  final int maxUploadBytes;
  final List<AudioFormat> formats;
  final String defaultFormat;
  final List<int> bitrates;
  final int defaultBitrate;
  final Duration resultTtl;

  const AudioLimits({
    required this.maxUploadBytes,
    required this.formats,
    required this.defaultFormat,
    required this.bitrates,
    required this.defaultBitrate,
    required this.resultTtl,
  });

  factory AudioLimits.fromJson(Map<String, dynamic> json) => AudioLimits(
        maxUploadBytes: (json['maxUploadBytes'] as num?)?.toInt() ?? 0,
        formats: (json['formats'] as List?)
                ?.map((f) => AudioFormat.fromJson(f as Map<String, dynamic>))
                .toList() ??
            const [],
        defaultFormat: json['defaultFormat'] as String? ?? 'mp3',
        bitrates:
            (json['bitrates'] as List?)?.map((b) => (b as num).toInt()).toList() ??
                const [],
        defaultBitrate: (json['defaultBitrate'] as num?)?.toInt() ?? 192,
        resultTtl:
            Duration(seconds: (json['resultTtlSeconds'] as num?)?.toInt() ?? 0),
      );

  AudioFormat? formatById(String id) {
    for (final format in formats) {
      if (format.id == id) return format;
    }
    return null;
  }

  /// The bitrates to offer for [format]: its own list where it has one, the
  /// common set otherwise, and none at all for lossless output.
  List<int> bitratesFor(AudioFormat? format) {
    if (format == null) return bitrates;
    if (!format.lossy) return const [];
    return format.bitrates.isNotEmpty ? format.bitrates : bitrates;
  }
}

/// One conversion, as the server currently sees it.
class AudioJob {
  final String id;
  final String stage;
  final String step;
  final double percent;
  final String sourceName;
  final String resultName;
  final String format;
  final int bitrate;
  final double seconds;
  final int sizeBytes;
  final bool downloadable;
  final String? error;

  const AudioJob({
    required this.id,
    required this.stage,
    this.step = '',
    this.percent = 0,
    this.sourceName = '',
    this.resultName = '',
    this.format = '',
    this.bitrate = 0,
    this.seconds = 0,
    this.sizeBytes = 0,
    this.downloadable = false,
    this.error,
  });

  factory AudioJob.fromJson(Map<String, dynamic> json) => AudioJob(
        id: json['id'] as String? ?? '',
        stage: json['stage'] as String? ?? 'queued',
        step: json['step'] as String? ?? '',
        percent: (json['percent'] as num?)?.toDouble() ?? 0,
        sourceName: json['sourceName'] as String? ?? '',
        resultName: json['resultName'] as String? ?? '',
        format: json['format'] as String? ?? '',
        bitrate: (json['bitrate'] as num?)?.toInt() ?? 0,
        seconds: (json['seconds'] as num?)?.toDouble() ?? 0,
        sizeBytes: (json['sizeBytes'] as num?)?.toInt() ?? 0,
        downloadable: json['downloadable'] as bool? ?? false,
        error: json['error'] as String?,
      );

  bool get running => stage == 'queued' || stage == 'transcoding';
  bool get failed => stage == 'failed';
  bool get expired => stage == 'expired';
}

/// The converter's HTTP API.
///
/// Every call carries the caller's Firebase ID token, which is the only
/// credential involved — the converter verifies it against the same project
/// the app signs in to, and holds no accounts of its own.
class AudioApi {
  final String base;
  final http.Client _client;
  final Future<String?> Function() _token;

  AudioApi({
    String? base,
    http.Client? client,

    /// Where the bearer token comes from. Overridden in tests; in the app it
    /// is whatever Firebase currently holds.
    Future<String?> Function()? token,
  })  : base = (base ?? kConvertApiBase).replaceAll(RegExp(r'/+$'), ''),
        _client = client ?? http.Client(),
        _token = token ?? _firebaseToken;

  void close() => _client.close();

  /// Tokens are short-lived and the SDK refreshes them on demand, so this is
  /// read per request rather than cached — a cached one goes stale in the
  /// middle of a long conversion.
  static Future<String?> _firebaseToken() async =>
      FirebaseAuth.instance.currentUser?.getIdToken();

  Future<Map<String, String>> _headers() async {
    String? token;
    try {
      token = await _token();
    } catch (_) {
      // A build with no Firebase app reaches here. It is a sign-in problem
      // either way, and calling it a network failure would send somebody off
      // to check a converter that is running perfectly well.
      token = null;
    }
    if (token == null) {
      throw const AudioError('Sign in to convert files.');
    }
    return {'Authorization': 'Bearer $token'};
  }

  Future<AudioLimits> limits() async {
    final response = await _send(() async => _client.get(_uri('/v1/limits')));
    return AudioLimits.fromJson(
        jsonDecode(response.body) as Map<String, dynamic>);
  }

  Future<AudioJob> submit({
    required Uint8List bytes,
    required String fileName,
    required String format,
    required int bitrate,
  }) async {
    final request = http.MultipartRequest(
      'POST',
      _uri('/v1/jobs', {'format': format, 'bitrate': '$bitrate'}),
    )
      ..headers.addAll(await _headers())
      ..files
          .add(http.MultipartFile.fromBytes('file', bytes, filename: fileName));

    final response = await _send(() async {
      final streamed = await _client.send(request);
      return http.Response.fromStream(streamed);
    });
    return AudioJob.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }

  Future<AudioJob> status(String id) async {
    final response = await _send(
      () async => _client.get(_uri('/v1/jobs/$id'), headers: await _headers()),
    );
    return AudioJob.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }

  Future<Uint8List> download(String id) async {
    final response = await _send(
      () async => _client.get(
        _uri('/v1/jobs/$id/result'),
        headers: await _headers(),
      ),
    );
    return response.bodyBytes;
  }

  Future<void> cancel(String id) async {
    await _send(
      () async =>
          _client.delete(_uri('/v1/jobs/$id'), headers: await _headers()),
    );
  }

  Uri _uri(String path, [Map<String, String>? query]) =>
      Uri.parse('$base$path').replace(queryParameters: query);

  /// Runs a request and turns every failure into an [AudioError].
  ///
  /// A browser cannot tell "server is down" from "CORS refused it" — both
  /// surface as the same opaque failure — so the message covers both rather
  /// than guessing.
  Future<http.Response> _send(Future<http.Response> Function() call) async {
    final http.Response response;
    try {
      response = await call();
    } on AudioError {
      rethrow;
    } catch (_) {
      throw AudioError('The converter at $base is not reachable.');
    }

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return response;
    }

    throw AudioError(
      _messageOf(response),
      gone: response.statusCode == 404 || response.statusCode == 410,
    );
  }

  String _messageOf(http.Response response) {
    try {
      final body = jsonDecode(response.body);
      if (body is Map && body['error'] is String) return body['error'] as String;
    } catch (_) {
      // A proxy in front of the API answers HTML, not the JSON shape.
    }
    return switch (response.statusCode) {
      401 => 'Sign in to convert files.',
      413 => 'That file is too large.',
      _ => 'The converter returned ${response.statusCode}.',
    };
  }
}
