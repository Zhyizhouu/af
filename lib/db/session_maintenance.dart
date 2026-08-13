import 'database_helper.dart';

/// How long after its scheduled time a session is considered done.
///
/// Proctoring is finished well inside four hours, so anything older is
/// clutter in Today and Upcoming — it buries the sessions that still matter.
const Duration sessionStaleAfter = Duration(hours: 4);

/// Archives sessions whose scheduled time is more than [sessionStaleAfter]
/// in the past.
///
/// Idempotent and cheap, so it can run on every read of the session lists
/// rather than needing a timer. Sessions reopened by hand are exempt — see
/// [ProctorSession.reopened].
///
/// Returns how many it archived.
Future<int> archiveStaleSessions({DateTime? now}) async {
  final db = DatabaseHelper.instance;
  final moment = now ?? DateTime.now();
  final cutoff = moment.subtract(sessionStaleAfter);

  var archived = 0;
  for (final session in db.sessionsBox.values) {
    if (session.status != 'active') continue;
    if (session.reopened) continue;
    if (session.dateTime.isAfter(cutoff)) continue;

    session.status = 'archived';
    session.updatedAt = moment;
    await session.save();
    archived++;
  }
  return archived;
}
