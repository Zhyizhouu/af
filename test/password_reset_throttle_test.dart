import 'package:flutter_test/flutter_test.dart';

import 'package:af/auth/password_reset_throttle.dart';

/// The parts of the reset cooldown that run without a server.
///
/// The limit itself is enforced by the Firestore rules and cannot be tested
/// from here — what is testable is that two spellings of one address share a
/// cooldown, that the stored key gives nothing away, and that the countdown
/// the app displays is derived rather than assumed.
void main() {
  group('cooldown key', () {
    test('one address is one cooldown however it is typed', () {
      final canonical = PasswordResetThrottle.keyFor('user@example.com');

      expect(PasswordResetThrottle.keyFor('USER@example.com'), canonical);
      expect(PasswordResetThrottle.keyFor('  user@Example.COM  '), canonical);
    });

    test('different addresses do not collide', () {
      expect(
        PasswordResetThrottle.keyFor('a@example.com'),
        isNot(PasswordResetThrottle.keyFor('b@example.com')),
      );
    });

    // The collection has to accept unauthenticated writes, so its ids are
    // world-visible. A hash keeps that from being a list of real addresses.
    test('the key does not carry the address', () {
      final key = PasswordResetThrottle.keyFor('user@example.com');

      expect(key, hasLength(64));
      expect(key, matches(RegExp(r'^[0-9a-f]{64}$')));
      expect(key, isNot(contains('example')));
    });
  });

  group('remaining time', () {
    final sentAt = DateTime.utc(2026, 8, 14, 9);
    const window = Duration(minutes: 2);

    test('counts down from the send', () {
      expect(
        PasswordResetThrottle.remainingOf(
          sentAt: sentAt,
          window: window,
          now: sentAt.add(const Duration(seconds: 30)),
        ),
        const Duration(seconds: 90),
      );
    });

    test('clamps at zero once the window has passed', () {
      expect(
        PasswordResetThrottle.remainingOf(
          sentAt: sentAt,
          window: window,
          now: sentAt.add(const Duration(minutes: 5)),
        ),
        Duration.zero,
      );
    });

    // Both nulls mean "the server said no but would not say for how long".
    // Showing a number there would be inventing one.
    test('is unknown without a policy or a stamp', () {
      expect(
        PasswordResetThrottle.remainingOf(
          sentAt: sentAt,
          window: null,
          now: sentAt,
        ),
        isNull,
      );
      expect(
        PasswordResetThrottle.remainingOf(
          sentAt: null,
          window: window,
          now: sentAt,
        ),
        isNull,
      );
    });
  });
}
