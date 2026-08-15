import '../calendar/calendar_provider.dart';
import 'ai_api.dart';

/// One turn as it sits on screen, and as it is stored.
///
/// Mutable, unlike most state in AF, because the two things that change after
/// a turn arrives — which proposals were dropped, and whether the rest were
/// carried out — belong to that turn rather than to the page.
///
/// It knows how to write itself down because the transcript is the only record
/// of a conversation that exists: the assistant's API keeps nothing between
/// calls, so anything not saved here is gone the moment the page is closed.
class AiMessage {
  final String role;
  final String text;
  final List<SessionProposal> sessions;
  final List<EventProposal> events;

  /// Entries the assistant offered to delete, resolved to this app's own
  /// records the moment the answer arrived. Snapshotted rather than looked up
  /// at paint time: committing the deletion removes them from the calendar,
  /// and the transcript still has to show what was done — which is doubly true
  /// once the conversation can be reopened days later on another device.
  final List<AgendaEntry> removals;

  /// Indices the person dropped. Held as index sets rather than by rebuilding
  /// the lists, so dropping one cannot renumber the rest mid-review.
  final Set<int> droppedSessions;
  final Set<int> droppedEvents;
  final Set<int> droppedRemovals;

  /// Set once this turn was carried out. The cards stay on screen afterwards —
  /// the transcript is a record of what happened — but nothing about them can
  /// be changed or run twice. Saved, so that reopening a conversation cannot
  /// offer to do it all again.
  bool committed;

  /// A failure, rendered in place rather than as a banner over the page. An
  /// error that scrolls away with the turn it belongs to stays attached to the
  /// thing that caused it.
  final bool failed;

  AiMessage({
    required this.role,
    required this.text,
    this.sessions = const [],
    this.events = const [],
    this.removals = const [],
    Set<int>? droppedSessions,
    Set<int>? droppedEvents,
    Set<int>? droppedRemovals,
    this.committed = false,
    this.failed = false,
  })  : droppedSessions = droppedSessions ?? <int>{},
        droppedEvents = droppedEvents ?? <int>{},
        droppedRemovals = droppedRemovals ?? <int>{};

  AiMessage.user(String text) : this(role: AiTurn.roleUser, text: text);

  AiMessage.error(String text)
      : this(role: AiTurn.roleAssistant, text: text, failed: true);

  /// Builds an assistant turn, resolving the ids it wants deleted against the
  /// calendar as it stands right now.
  ///
  /// An id that resolves to nothing is dropped rather than drawn as a
  /// placeholder: a delete card that cannot say what it deletes is not
  /// something anybody can confirm.
  factory AiMessage.assistant(AiAnswer answer, List<AgendaEntry> agenda) {
    final byId = {for (final entry in agenda) entry.id: entry};
    return AiMessage(
      role: AiTurn.roleAssistant,
      text: answer.reply,
      sessions: answer.sessions,
      events: answer.events,
      removals: [
        for (final id in answer.removals)
          if (byId[id] case final entry?) entry,
      ],
    );
  }

  bool get isUser => role == AiTurn.roleUser;

  bool get hasProposals =>
      sessions.isNotEmpty || events.isNotEmpty || removals.isNotEmpty;

  int get keptCount =>
      keptSessions.length + keptEvents.length + keptRemovals.length;

  List<SessionProposal> get keptSessions => [
        for (var i = 0; i < sessions.length; i++)
          if (!droppedSessions.contains(i)) sessions[i],
      ];

  List<EventProposal> get keptEvents => [
        for (var i = 0; i < events.length; i++)
          if (!droppedEvents.contains(i)) events[i],
      ];

  List<AgendaEntry> get keptRemovals => [
        for (var i = 0; i < removals.length; i++)
          if (!droppedRemovals.contains(i)) removals[i],
      ];

  /// What the server is told about this turn next time.
  ///
  /// Only what survived review is sent: the assistant should be working from
  /// what is still on the table, not from what was thrown out.
  AiTurn toTurn() => AiTurn(
        role: role,
        text: text,
        sessions: keptSessions,
        events: keptEvents,
        removals: [for (final entry in keptRemovals) entry.id],
        committed: committed,
      );

  // ---- storage ----

  Map<String, dynamic> toJson() => {
        'role': role,
        'text': text,
        if (sessions.isNotEmpty)
          'sessions': [for (final s in sessions) s.toJson()],
        if (events.isNotEmpty) 'events': [for (final e in events) e.toJson()],
        if (removals.isNotEmpty)
          'removals': [for (final r in removals) _entryToJson(r)],
        if (droppedSessions.isNotEmpty)
          'droppedSessions': droppedSessions.toList(),
        if (droppedEvents.isNotEmpty) 'droppedEvents': droppedEvents.toList(),
        if (droppedRemovals.isNotEmpty)
          'droppedRemovals': droppedRemovals.toList(),
        if (committed) 'committed': true,
        if (failed) 'failed': true,
      };

  /// Reads a stored turn back, or null if it is not one.
  ///
  /// Forgiving on the way in: this data has been through Hive and Firestore
  /// and may have been written by an older build of the app. A message that
  /// cannot be read is skipped, so one bad turn costs one turn rather than the
  /// whole conversation.
  static AiMessage? fromJson(Map<String, dynamic> json) {
    final role = json['role'] as String?;
    if (role != AiTurn.roleUser && role != AiTurn.roleAssistant) return null;

    return AiMessage(
      role: role!,
      text: json['text'] as String? ?? '',
      sessions: [
        for (final s in (json['sessions'] as List? ?? const []))
          if (SessionProposal.fromJson(s as Map<String, dynamic>)
              case final proposal?)
            proposal,
      ],
      events: [
        for (final e in (json['events'] as List? ?? const []))
          if (EventProposal.fromJson(e as Map<String, dynamic>)
              case final proposal?)
            proposal,
      ],
      removals: [
        for (final r in (json['removals'] as List? ?? const []))
          if (_entryFromJson(r as Map<String, dynamic>) case final entry?)
            entry,
      ],
      droppedSessions: _indices(json['droppedSessions']),
      droppedEvents: _indices(json['droppedEvents']),
      droppedRemovals: _indices(json['droppedRemovals']),
      committed: json['committed'] as bool? ?? false,
      failed: json['failed'] as bool? ?? false,
    );
  }

  static Set<int> _indices(Object? value) => {
        for (final i in (value as List? ?? const []))
          if (i is num) i.toInt(),
      };

  /// Only the fields the delete card draws. The category is not among them —
  /// it resolves to a colour, and this card is drawn in the warn colour
  /// whatever the entry was.
  static Map<String, dynamic> _entryToJson(AgendaEntry entry) => {
        'id': entry.id,
        'kind': entry.kind.name,
        'title': entry.title,
        'subtitle': entry.subtitle,
        'start': entry.start.toIso8601String(),
        'end': entry.end.toIso8601String(),
        'allDay': entry.allDay,
      };

  static AgendaEntry? _entryFromJson(Map<String, dynamic> json) {
    final start = DateTime.tryParse(json['start'] as String? ?? '');
    if (start == null) return null;

    return AgendaEntry(
      kind: json['kind'] == AgendaKind.session.name
          ? AgendaKind.session
          : AgendaKind.event,
      id: json['id'] as String? ?? '',
      title: json['title'] as String? ?? '',
      subtitle: json['subtitle'] as String? ?? '',
      start: start,
      end: DateTime.tryParse(json['end'] as String? ?? '') ?? start,
      allDay: json['allDay'] as bool? ?? false,
      category: null,
    );
  }
}
