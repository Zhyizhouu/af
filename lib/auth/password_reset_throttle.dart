import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:crypto/crypto.dart';

/// Raised when the server refuses to send another reset link yet.
///
/// [remaining] is null when the wait is real but its length could not be read —
/// the app then says "shortly" rather than inventing a number.
class PasswordResetCooldown implements Exception {
  final Duration? remaining;

  const PasswordResetCooldown(this.remaining);

  @override
  String toString() => 'PasswordResetCooldown($remaining)';
}

/// Server-side rate limit on password reset emails.
///
/// The wait lives in the Firestore security rules, not in this app. Every
/// attempt is a compare-and-set against `request.time` — the server's clock —
/// so refreshing the page, opening a second tab, switching browsers or calling
/// Firestore by hand all meet the same limit. Nothing here is enforcement; it
/// only asks, reports what the server said, and reads back the number to
/// display so even the countdown is the server's.
///
/// The one gap this cannot close: `sendPasswordResetEmail` is a client SDK call
/// straight to Firebase Auth, and Auth has no hook to route it through rules.
/// Somebody bypassing this app entirely is bounded by Firebase's own quotas
/// instead. Closing that would mean a Cloud Function holding the only path,
/// which needs the Blaze plan and an email provider of its own.
class PasswordResetThrottle {
  final FirebaseFirestore _firestore;

  PasswordResetThrottle({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

  static const _throttleCollection = 'passwordResetThrottle';
  static const _configCollection = 'config';
  static const _policyDocument = 'authPolicy';
  static const _cooldownField = 'passwordResetCooldownSeconds';
  static const _sentAtField = 'lastSentAt';

  /// Document id for [email].
  ///
  /// Hashed because the collection is world-readable by necessity — the person
  /// asking is signed out — and a collection of plain addresses would be worth
  /// harvesting. Lowercased and trimmed first so `A@b.com ` and `a@b.com` share
  /// one cooldown rather than each getting their own.
  static String keyFor(String email) =>
      sha256.convert(utf8.encode(email.trim().toLowerCase())).toString();

  /// What is left of the wait, or null if it cannot be worked out.
  ///
  /// Clamped at zero: a stamp older than the window means the next attempt is
  /// allowed, not that time is owed back.
  static Duration? remainingOf({
    required DateTime? sentAt,
    required Duration? window,
    required DateTime now,
  }) {
    if (sentAt == null || window == null) return null;
    final left = window - now.difference(sentAt);
    return left.isNegative ? Duration.zero : left;
  }

  /// The cooldown the rules are enforcing, or null if the policy document is
  /// missing or unreadable. Display only — the rules decide regardless.
  Future<Duration?> cooldown() async {
    try {
      final snapshot = await _firestore
          .collection(_configCollection)
          .doc(_policyDocument)
          .get();
      final seconds = snapshot.data()?[_cooldownField];
      if (seconds is num && seconds > 0) {
        return Duration(seconds: seconds.round());
      }
    } on FirebaseException {
      // No policy to read just means no countdown to show.
    }
    return null;
  }

  /// Claims the right to send a reset link to [email].
  ///
  /// Claiming before sending rather than after is deliberate: the server write
  /// is the arbiter, so two tabs racing cannot both get through. The cost is
  /// that a send failing afterwards still burns the window, which is why the
  /// caller checks the address is well formed before getting here.
  ///
  /// Throws [PasswordResetCooldown] when the previous link is still inside the
  /// window. Fails open on anything else — the throttle is a guard, not the
  /// feature, and an unreachable database should not stand between somebody
  /// and their own account. Firebase Auth's own quotas are the floor.
  Future<void> claim(String email) async {
    final document =
        _firestore.collection(_throttleCollection).doc(keyFor(email));

    try {
      await document.set({_sentAtField: FieldValue.serverTimestamp()});
      return;
    } on FirebaseException catch (error) {
      if (error.code != 'permission-denied') return;
    }

    // A refusal means one of two things: the cooldown is genuinely running, or
    // the rules were never published and the database is still denying
    // everything. They are told apart by whether a stamp exists at all — a
    // document that is not there cannot be inside a cooldown, so a refused
    // `create` is a misconfiguration and a refused `update` is a real wait.
    final sentAt = await _stampOn(document);
    if (sentAt == null) return;

    throw PasswordResetCooldown(
      remainingOf(
        sentAt: sentAt,
        window: await cooldown(),
        now: DateTime.now(),
      ),
    );
  }

  Future<DateTime?> _stampOn(
    DocumentReference<Map<String, dynamic>> document,
  ) async {
    try {
      // Straight from the server: the local cache can hold a stamp that the
      // rules have since moved on from, and a stale one would count down to
      // the wrong moment.
      final snapshot =
          await document.get(const GetOptions(source: Source.server));
      return (snapshot.data()?[_sentAtField] as Timestamp?)?.toDate();
    } on FirebaseException {
      return null;
    }
  }
}
