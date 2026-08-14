import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;
import 'package:intl/intl.dart';

import '../audio/audio_api.dart' show kConvertApiBase;

/// A failure worth showing somebody.
class AiError implements Exception {
  final String message;

  /// The assistant is rate limited rather than broken. Worth distinguishing,
  /// because waiting is the fix and retrying immediately is not.
  final bool throttled;

  const AiError(this.message, {this.throttled = false});

  @override
  String toString() => message;
}

/// The wire format for times, matching the backend's. A local wall clock with
/// no zone: the model is reasoning about "Monday at nine", and turning that
/// into an instant is this app's job, in this device's timezone.
final DateFormat aiTimeFormat = DateFormat('yyyy-MM-dd HH:mm');

DateTime? _parseLocal(String? value) {
  if (value == null || value.trim().isEmpty) return null;
  try {
    return aiTimeFormat.parseStrict(value.trim());
  } on FormatException {
    return null;
  }
}

/// A proposed proctoring session. Nothing is written until it is confirmed.
class SessionProposal {
  final String type;
  final DateTime start;
  final String room;
  final String courseCode;
  final String courseName;
  final String courseClass;

  const SessionProposal({
    required this.type,
    required this.start,
    required this.room,
    required this.courseCode,
    required this.courseName,
    required this.courseClass,
  });

  static SessionProposal? fromJson(Map<String, dynamic> json) {
    final start = _parseLocal(json['start'] as String?);
    if (start == null) return null;
    return SessionProposal(
      type: (json['type'] as String? ?? 'UAP').toUpperCase(),
      start: start,
      room: json['room'] as String? ?? '',
      courseCode: json['courseCode'] as String? ?? '',
      courseName: json['courseName'] as String? ?? '',
      courseClass: json['courseClass'] as String? ?? '',
    );
  }

  SessionProposal copyWith({
    String? type,
    DateTime? start,
    String? room,
    String? courseCode,
    String? courseName,
    String? courseClass,
  }) =>
      SessionProposal(
        type: type ?? this.type,
        start: start ?? this.start,
        room: room ?? this.room,
        courseCode: courseCode ?? this.courseCode,
        courseName: courseName ?? this.courseName,
        courseClass: courseClass ?? this.courseClass,
      );

  /// What the checklist list shows as a session's name.
  String get label => [courseCode, courseName].where((s) => s.isNotEmpty).join(' · ');
}

/// A proposed calendar event.
class EventProposal {
  final String title;
  final String notes;
  final DateTime start;
  final DateTime end;
  final bool allDay;
  final String category;

  const EventProposal({
    required this.title,
    required this.notes,
    required this.start,
    required this.end,
    required this.allDay,
    required this.category,
  });

  static EventProposal? fromJson(Map<String, dynamic> json) {
    final start = _parseLocal(json['start'] as String?);
    if (start == null) return null;
    final end = _parseLocal(json['end'] as String?) ?? start.add(const Duration(hours: 1));
    return EventProposal(
      title: json['title'] as String? ?? '',
      notes: json['notes'] as String? ?? '',
      start: start,
      end: end.isAfter(start) ? end : start.add(const Duration(hours: 1)),
      allDay: json['allDay'] as bool? ?? false,
      category: json['category'] as String? ?? 'other',
    );
  }

  EventProposal copyWith({
    String? title,
    String? notes,
    DateTime? start,
    DateTime? end,
    bool? allDay,
    String? category,
  }) =>
      EventProposal(
        title: title ?? this.title,
        notes: notes ?? this.notes,
        start: start ?? this.start,
        end: end ?? this.end,
        allDay: allDay ?? this.allDay,
        category: category ?? this.category,
      );
}

/// One answer from the assistant.
class AiPlan {
  final List<SessionProposal> sessions;
  final List<EventProposal> events;

  /// The model's own remark — what it assumed, or what it could not work out.
  /// Worth reading before confirming anything.
  final String note;

  const AiPlan({
    required this.sessions,
    required this.events,
    required this.note,
  });

  bool get isEmpty => sessions.isEmpty && events.isEmpty;
  int get total => sessions.length + events.length;

  factory AiPlan.fromJson(Map<String, dynamic> json) => AiPlan(
        sessions: [
          for (final s in (json['sessions'] as List? ?? const []))
            ?SessionProposal.fromJson(s as Map<String, dynamic>),
        ],
        events: [
          for (final e in (json['events'] as List? ?? const []))
            ?EventProposal.fromJson(e as Map<String, dynamic>),
        ],
        note: json['note'] as String? ?? '',
      );
}

class AiLimits {
  /// False when the server has no API key. The page says so instead of
  /// offering a button that cannot work.
  final bool configured;
  final List<String> sessionTypes;
  final int maxProposals;

  const AiLimits({
    required this.configured,
    required this.sessionTypes,
    required this.maxProposals,
  });

  factory AiLimits.fromJson(Map<String, dynamic> json) => AiLimits(
        configured: json['configured'] as bool? ?? false,
        sessionTypes: (json['sessionTypes'] as List?)
                ?.map((t) => t as String)
                .toList() ??
            const ['UAP', 'UAS'],
        maxProposals: (json['maxProposals'] as num?)?.toInt() ?? 40,
      );
}

/// The assistant's API.
///
/// One synchronous call. No job id, no polling: the model answers in a second
/// or two, and nothing is stored anywhere until this app writes it locally.
class AiApi {
  final String base;
  final http.Client _client;
  final Future<String?> Function() _token;

  AiApi({
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
      throw const AiError('Sign in to use the assistant.');
    }
    return {
      'Authorization': 'Bearer $token',
      if (json) 'Content-Type': 'application/json',
    };
  }

  Future<AiLimits> limits() async {
    final response = await _send(() async => _client.get(_uri('/v1/ai/limits')));
    return AiLimits.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }

  /// Asks for entries.
  ///
  /// [now] and [categories] are sent rather than assumed by the server:
  /// "next Monday" depends on where the person asking is, and the categories
  /// belong to this account.
  Future<AiPlan> plan({
    required String prompt,
    required DateTime now,
    required List<String> categories,
  }) async {
    final response = await _send(
      () async => _client.post(
        _uri('/v1/ai/plan'),
        headers: await _headers(json: true),
        body: jsonEncode({
          'prompt': prompt,
          'now': aiTimeFormat.format(now),
          'categories': categories,
        }),
      ),
    );
    return AiPlan.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }

  Uri _uri(String path) => Uri.parse('$base$path');

  Future<http.Response> _send(Future<http.Response> Function() call) async {
    final http.Response response;
    try {
      response = await call();
    } on AiError {
      rethrow;
    } catch (_) {
      throw AiError('The assistant at $base is not reachable.');
    }

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return response;
    }
    throw AiError(
      _messageOf(response),
      throttled: response.statusCode == 429,
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
      401 => 'Sign in to use the assistant.',
      429 => 'The assistant has hit its quota for now. Try again shortly.',
      503 => 'The assistant is not configured on this server.',
      _ => 'The assistant returned ${response.statusCode}.',
    };
  }
}
