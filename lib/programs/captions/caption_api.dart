import 'dart:convert';
import 'dart:typed_data';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;

import '../audio/audio_api.dart' show kConvertApiBase;

/// A failure worth showing somebody.
class CaptionError implements Exception {
  final String message;
  final bool gone;

  const CaptionError(this.message, {this.gone = false});

  @override
  String toString() => message;
}

/// One caption: a span of time and the words in it.
///
/// Immutable, with [copyWith] doing the editing, because the editor keeps an
/// undo stack and a mutable segment would make every entry in it the same
/// object.
class CaptionSegment {
  final double start;
  final double end;
  final String text;

  const CaptionSegment({
    required this.start,
    required this.end,
    required this.text,
  });

  double get duration => end - start;

  factory CaptionSegment.fromJson(Map<String, dynamic> json) => CaptionSegment(
        start: (json['start'] as num?)?.toDouble() ?? 0,
        end: (json['end'] as num?)?.toDouble() ?? 0,
        text: json['text'] as String? ?? '',
      );

  Map<String, dynamic> toJson() => {'start': start, 'end': end, 'text': text};

  CaptionSegment copyWith({double? start, double? end, String? text}) =>
      CaptionSegment(
        start: start ?? this.start,
        end: end ?? this.end,
        text: text ?? this.text,
      );
}

/// The transcript, as it arrives for editing.
class CaptionTranscript {
  final List<CaptionSegment> segments;
  final double seconds;
  final String language;

  const CaptionTranscript({
    required this.segments,
    required this.seconds,
    required this.language,
  });

  factory CaptionTranscript.fromJson(Map<String, dynamic> json) =>
      CaptionTranscript(
        segments: (json['segments'] as List?)
                ?.map((s) => CaptionSegment.fromJson(s as Map<String, dynamic>))
                .toList() ??
            const [],
        seconds: (json['seconds'] as num?)?.toDouble() ?? 0,
        language: json['language'] as String? ?? '',
      );
}

class CaptionLanguage {
  final String id;
  final String label;

  const CaptionLanguage({required this.id, required this.label});

  factory CaptionLanguage.fromJson(Map<String, dynamic> json) => CaptionLanguage(
        id: json['id'] as String? ?? '',
        label: json['label'] as String? ?? '',
      );
}

class CaptionLimits {
  final int maxUploadBytes;
  final List<CaptionLanguage> languages;
  final Duration reviewTtl;
  final Duration resultTtl;

  /// False when the server has no Gemini key. The page says so instead of
  /// accepting an upload that would fail a minute later.
  final bool configured;

  const CaptionLimits({
    required this.maxUploadBytes,
    required this.languages,
    required this.reviewTtl,
    required this.resultTtl,
    required this.configured,
  });

  factory CaptionLimits.fromJson(Map<String, dynamic> json) => CaptionLimits(
        maxUploadBytes: (json['maxUploadBytes'] as num?)?.toInt() ?? 0,
        languages: (json['languages'] as List?)
                ?.map((l) => CaptionLanguage.fromJson(l as Map<String, dynamic>))
                .toList() ??
            const [],
        reviewTtl:
            Duration(seconds: (json['reviewTtlSeconds'] as num?)?.toInt() ?? 0),
        resultTtl:
            Duration(seconds: (json['resultTtlSeconds'] as num?)?.toInt() ?? 0),
        configured: json['configured'] as bool? ?? false,
      );
}

/// One caption job, as the server currently sees it.
class CaptionJob {
  final String id;
  final String stage;
  final String step;
  final double percent;
  final String sourceName;
  final String language;
  final double seconds;
  final int segments;

  /// How long until the workflow stops waiting and muxes what it has.
  final int reviewSeconds;

  final String videoName;
  final String subtitleName;
  final int sizeBytes;
  final bool downloadable;
  final String? error;

  const CaptionJob({
    required this.id,
    required this.stage,
    this.step = '',
    this.percent = 0,
    this.sourceName = '',
    this.language = '',
    this.seconds = 0,
    this.segments = 0,
    this.reviewSeconds = 0,
    this.videoName = '',
    this.subtitleName = '',
    this.sizeBytes = 0,
    this.downloadable = false,
    this.error,
  });

  factory CaptionJob.fromJson(Map<String, dynamic> json) => CaptionJob(
        id: json['id'] as String? ?? '',
        stage: json['stage'] as String? ?? 'queued',
        step: json['step'] as String? ?? '',
        percent: (json['percent'] as num?)?.toDouble() ?? 0,
        sourceName: json['sourceName'] as String? ?? '',
        language: json['language'] as String? ?? '',
        seconds: (json['seconds'] as num?)?.toDouble() ?? 0,
        segments: (json['segments'] as num?)?.toInt() ?? 0,
        reviewSeconds: (json['reviewSeconds'] as num?)?.toInt() ?? 0,
        videoName: json['videoName'] as String? ?? '',
        subtitleName: json['subtitleName'] as String? ?? '',
        sizeBytes: (json['sizeBytes'] as num?)?.toInt() ?? 0,
        downloadable: json['downloadable'] as bool? ?? false,
        error: json['error'] as String?,
      );

  bool get working =>
      stage == 'queued' || stage == 'transcribing' || stage == 'muxing';

  /// The job is parked, holding its transcript, waiting to be edited.
  bool get reviewing => stage == 'review';

  bool get failed => stage == 'failed';
}

/// The caption half of the converter's API.
class CaptionApi {
  final String base;
  final http.Client _client;
  final Future<String?> Function() _token;

  CaptionApi({
    String? base,
    http.Client? client,
    Future<String?> Function()? token,
  })  : base = (base ?? kConvertApiBase).replaceAll(RegExp(r'/+$'), ''),
        _client = client ?? http.Client(),
        _token = token ?? _firebaseToken;

  void close() => _client.close();

  static Future<String?> _firebaseToken() async =>
      FirebaseAuth.instance.currentUser?.getIdToken();

  Future<Map<String, String>> _headers({bool json = false}) async {
    String? token;
    try {
      token = await _token();
    } catch (_) {
      token = null;
    }
    if (token == null) {
      throw const CaptionError('Sign in to caption videos.');
    }
    return {
      'Authorization': 'Bearer $token',
      if (json) 'Content-Type': 'application/json',
    };
  }

  Future<CaptionLimits> limits() async {
    final response =
        await _send(() async => _client.get(_uri('/v1/captions/limits')));
    return CaptionLimits.fromJson(
        jsonDecode(response.body) as Map<String, dynamic>);
  }

  Future<CaptionJob> submit({
    required Uint8List bytes,
    required String fileName,
    required String language,
  }) async {
    final request = http.MultipartRequest(
      'POST',
      _uri('/v1/captions', {'language': language}),
    )
      ..headers.addAll(await _headers())
      ..files
          .add(http.MultipartFile.fromBytes('file', bytes, filename: fileName));

    final response = await _send(() async {
      final streamed = await _client.send(request);
      return http.Response.fromStream(streamed);
    });
    return CaptionJob.fromJson(
        jsonDecode(response.body) as Map<String, dynamic>);
  }

  Future<CaptionJob> status(String id) async {
    final response = await _send(
      () async =>
          _client.get(_uri('/v1/captions/$id'), headers: await _headers()),
    );
    return CaptionJob.fromJson(
        jsonDecode(response.body) as Map<String, dynamic>);
  }

  /// Fetched once, when the editor opens — a two-hour lecture is a large
  /// answer and it does not change while the job waits.
  Future<CaptionTranscript> transcript(String id) async {
    final response = await _send(
      () async => _client.get(
        _uri('/v1/captions/$id/segments'),
        headers: await _headers(),
      ),
    );
    return CaptionTranscript.fromJson(
        jsonDecode(response.body) as Map<String, dynamic>);
  }

  /// Sends the edits back and releases the workflow's wait.
  Future<void> approve(String id, List<CaptionSegment> segments) async {
    await _send(
      () async => _client.post(
        _uri('/v1/captions/$id/approve'),
        headers: await _headers(json: true),
        body: jsonEncode({
          'segments': [for (final segment in segments) segment.toJson()],
        }),
      ),
    );
  }

  /// [artefact] is `video` for the muxed MP4 or `subtitles` for the SRT.
  Future<Uint8List> download(String id, String artefact) async {
    final response = await _send(
      () async => _client.get(
        _uri('/v1/captions/$id/result/$artefact'),
        headers: await _headers(),
      ),
    );
    return response.bodyBytes;
  }

  Future<void> cancel(String id) async {
    await _send(
      () async =>
          _client.delete(_uri('/v1/captions/$id'), headers: await _headers()),
    );
  }

  Uri _uri(String path, [Map<String, String>? query]) =>
      Uri.parse('$base$path').replace(queryParameters: query);

  Future<http.Response> _send(Future<http.Response> Function() call) async {
    final http.Response response;
    try {
      response = await call();
    } on CaptionError {
      rethrow;
    } catch (_) {
      throw CaptionError('The converter at $base is not reachable.');
    }

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return response;
    }

    throw CaptionError(
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
      401 => 'Sign in to caption videos.',
      413 => 'That file is too large.',
      503 => 'Captioning is not configured on this server.',
      _ => 'The converter returned ${response.statusCode}.',
    };
  }
}
