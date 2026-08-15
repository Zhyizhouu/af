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

  /// Sent back with the next message, so the assistant can see what it put on
  /// the table when somebody says "move that one to ten".
  Map<String, dynamic> toJson() => {
        'type': type,
        'start': aiTimeFormat.format(start),
        'room': room,
        'courseCode': courseCode,
        'courseName': courseName,
        'courseClass': courseClass,
      };

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

  Map<String, dynamic> toJson() => {
        'title': title,
        'notes': notes,
        'start': aiTimeFormat.format(start),
        'end': aiTimeFormat.format(end),
        'allDay': allDay,
        'category': category,
      };
}

/// Something already in the calendar, on its way to the assistant.
///
/// Sent with every message because the records live on this device and the
/// server holds none of them. Without it the assistant is blind to everything
/// it did not itself propose — "cancel the lunch tomorrow" reads to it as a
/// lunch that does not exist.
class AiEntry {
  static const kindEvent = 'event';
  static const kindSession = 'session';

  /// This app's own identifier, round-tripped untouched. A removal is only
  /// honoured when it names one of these.
  final String id;
  final String kind;

  final String title;
  final DateTime start;
  final DateTime end;
  final bool allDay;
  final String category;

  /// A session's fields, unflattened.
  ///
  /// Moving a session means deleting it and proposing its replacement, and a
  /// replacement cannot be rebuilt from a display title: "UAS · Room 401"
  /// does not say which course it is, and a session proposed without one is
  /// thrown out as nonsense. Empty for events.
  final String type;
  final String room;
  final String courseCode;
  final String courseName;
  final String courseClass;

  const AiEntry({
    required this.id,
    required this.kind,
    required this.title,
    required this.start,
    required this.end,
    required this.allDay,
    this.category = '',
    this.type = '',
    this.room = '',
    this.courseCode = '',
    this.courseName = '',
    this.courseClass = '',
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'kind': kind,
        'title': title,
        'start': aiTimeFormat.format(start),
        'end': aiTimeFormat.format(end),
        'allDay': allDay,
        if (category.isNotEmpty) 'category': category,
        if (type.isNotEmpty) 'type': type,
        if (room.isNotEmpty) 'room': room,
        if (courseCode.isNotEmpty) 'courseCode': courseCode,
        if (courseName.isNotEmpty) 'courseName': courseName,
        if (courseClass.isNotEmpty) 'courseClass': courseClass,
      };
}

/// One answer from the assistant: what it said, and what it is offering.
class AiAnswer {
  /// The conversational half — what it assumed, what it could not work out, or
  /// simply an answer to a question. Never empty; the server guarantees it,
  /// because a chat cannot render a turn with nothing in it.
  final String reply;

  final List<SessionProposal> sessions;
  final List<EventProposal> events;

  /// Ids of existing entries it is offering to delete. Ids only — this app
  /// draws the card from its own copy of the record, so a card can never
  /// describe one entry while deleting another.
  final List<String> removals;

  const AiAnswer({
    required this.reply,
    required this.sessions,
    required this.events,
    this.removals = const [],
  });

  bool get isEmpty => sessions.isEmpty && events.isEmpty && removals.isEmpty;
  int get total => sessions.length + events.length + removals.length;

  factory AiAnswer.fromJson(Map<String, dynamic> json) => AiAnswer(
        reply: json['reply'] as String? ?? '',
        sessions: [
          for (final s in (json['sessions'] as List? ?? const []))
            ?SessionProposal.fromJson(s as Map<String, dynamic>),
        ],
        events: [
          for (final e in (json['events'] as List? ?? const []))
            ?EventProposal.fromJson(e as Map<String, dynamic>),
        ],
        removals: [
          for (final id in (json['removals'] as List? ?? const []))
            if (id is String && id.trim().isNotEmpty) id,
        ],
      );
}

/// One message in the conversation, on its way back to the server.
///
/// The transcript lives here rather than on the server. That is the whole
/// reason the assistant needs no per-account storage: there is no conversation
/// on the other end to scope to an account, expire, or hand to the wrong
/// person — only this app's own memory of what it said and heard.
class AiTurn {
  static const roleUser = 'user';
  static const roleAssistant = 'assistant';

  final String role;
  final String text;

  /// What the assistant proposed on this turn. Echoed back because the prose
  /// alone does not say which entries were on the table.
  final List<SessionProposal> sessions;
  final List<EventProposal> events;
  final List<String> removals;

  /// Set once these were confirmed, so the assistant does not offer to carry
  /// them out all over again.
  final bool committed;

  const AiTurn({
    required this.role,
    required this.text,
    this.sessions = const [],
    this.events = const [],
    this.removals = const [],
    this.committed = false,
  });

  Map<String, dynamic> toJson() => {
        'role': role,
        'text': text,
        if (sessions.isNotEmpty)
          'sessions': [for (final s in sessions) s.toJson()],
        if (events.isNotEmpty) 'events': [for (final e in events) e.toJson()],
        if (removals.isNotEmpty) 'removals': removals,
        if (committed) 'committed': true,
      };
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
/// One synchronous call per message. No job id, no polling: the model answers
/// in a second or two, and nothing is stored anywhere until this app writes it
/// locally.
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

  /// Signed like every other call: the server gates this behind an account
  /// too, so an unauthenticated reader cannot learn what is configured on it.
  Future<AiLimits> limits() async {
    final response = await _send(
      () async => _client.get(_uri('/v1/ai/limits'), headers: await _headers()),
    );
    return AiLimits.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }

  /// Says something to the assistant and reads what comes back.
  ///
  /// [history] is the conversation so far and [existing] is what is already
  /// scheduled — the server keeps neither between calls. [now] and
  /// [categories] are sent rather than assumed: "next Monday" depends on where
  /// the person asking is, and the categories belong to this account.
  Future<AiAnswer> send({
    required String message,
    required List<AiTurn> history,
    required List<AiEntry> existing,
    required DateTime now,
    required List<String> categories,
  }) async {
    final response = await _send(
      () async => _client.post(
        _uri('/v1/ai/plan'),
        headers: await _headers(json: true),
        body: jsonEncode({
          'prompt': message,
          'history': [for (final turn in history) turn.toJson()],
          'existing': [for (final entry in existing) entry.toJson()],
          'now': aiTimeFormat.format(now),
          'categories': categories,
        }),
      ),
    );
    return AiAnswer.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
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
