import 'package:intl/intl.dart';

/// Jakarta time, and the day boundaries every habit record is bucketed into.
///
/// Habits are counted per *day*, so the only question that matters is which day
/// an instant belongs to — and that answer must not change when the device's
/// clock does. A phone taken to Singapore, or a browser reporting UTC, would
/// otherwise silently move a tick onto the wrong day and corrupt a streak.
///
/// Indonesia does not observe daylight saving, so WIB is UTC+7 all year and a
/// fixed offset is exact rather than an approximation. That is what makes this
/// safe to do without a timezone database.
const Duration jakartaOffset = Duration(hours: 7);

/// The Jakarta wall clock, as a naive [DateTime] whose fields read as Jakarta
/// local time. Never compare this to `DateTime.now()`.
DateTime jakartaNow() => DateTime.now().toUtc().add(jakartaOffset);

final DateFormat _keyFormat = DateFormat('yyyy-MM-dd');
final DateFormat _longFormat = DateFormat('d MMMM y');

/// The Jakarta day an instant falls on, as `YYYY-MM-DD`.
///
/// A string, because this is also the record's identity — its Hive key and its
/// Firestore document id. Sortable, human-readable in the console, and immune
/// to the timezone drift a `DateTime` key would carry.
String jakartaDayKey([DateTime? instant]) {
  final moment = instant == null
      ? jakartaNow()
      : instant.toUtc().add(jakartaOffset);
  return _keyFormat.format(moment);
}

/// A day key as a naive midnight [DateTime], for formatting and arithmetic.
DateTime dayFromKey(String key) => _keyFormat.parse(key);

/// The [count] most recent day keys ending today, newest first.
///
/// Like every `now` in this file, the argument is a real instant in any zone —
/// not an already-shifted Jakarta clock. Conversion happens here, once.
List<String> recentDayKeys(int count, {DateTime? now}) {
  // Sampled once: reading the clock per field could straddle midnight and
  // produce a list that skips or repeats a day.
  final moment =
      now == null ? jakartaNow() : now.toUtc().add(jakartaOffset);
  final today = DateTime(moment.year, moment.month, moment.day);
  return [
    for (var i = 0; i < count; i++)
      _keyFormat.format(today.subtract(Duration(days: i))),
  ];
}

/// `@Today`, `@Yesterday`, or `@14 August 2026`.
///
/// The two relative labels are the only ones worth special-casing: they are the
/// rows anyone actually ticks. Everything older reads better as a real date
/// than as "@5 days ago", which forces the reader to do arithmetic.
String habitDayLabel(String key, {DateTime? now}) {
  final today = jakartaDayKey(now);
  if (key == today) return '@Today';

  final yesterday = _keyFormat.format(
    dayFromKey(today).subtract(const Duration(days: 1)),
  );
  if (key == yesterday) return '@Yesterday';

  return '@${_longFormat.format(dayFromKey(key))}';
}
