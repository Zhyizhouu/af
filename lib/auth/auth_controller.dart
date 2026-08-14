import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../app/firebase_init.dart';
import 'password_reset_throttle.dart';

/// The signed-in user, or null. Emits a single null when Firebase is
/// unavailable so callers never have to special-case that.
final authStateProvider = StreamProvider<User?>((ref) {
  if (!afFirebaseReady) return Stream<User?>.value(null);
  return FirebaseAuth.instance.authStateChanges();
});

/// Convenience view of [authStateProvider] for widgets that only care whether
/// somebody is signed in.
final currentUserProvider = Provider<User?>((ref) {
  return ref.watch(authStateProvider).valueOrNull;
});

final isSignedInProvider = Provider<bool>((ref) {
  return ref.watch(currentUserProvider) != null;
});

class AuthController {
  final PasswordResetThrottle _resetThrottle;

  AuthController({PasswordResetThrottle? resetThrottle})
      : _resetThrottle = resetThrottle ?? PasswordResetThrottle();

  void _requireFirebase() {
    if (afFirebaseReady) return;
    throw FirebaseAuthException(
      code: 'unavailable',
      message: 'Firebase is not configured on this build.',
    );
  }

  /// Google sign-in.
  ///
  /// Uses `firebase_auth`'s own provider flows rather than the `google_sign_in`
  /// plugin: a popup on web, and the native/Custom Tabs flow elsewhere. That
  /// keeps one dependency out of the tree and one fewer API to track.
  Future<void> signInWithGoogle() async {
    _requireFirebase();
    final provider = GoogleAuthProvider()..addScope('email');

    if (kIsWeb) {
      await FirebaseAuth.instance.signInWithPopup(provider);
    } else {
      await FirebaseAuth.instance.signInWithProvider(provider);
    }
  }

  Future<void> signInWithEmail({
    required String email,
    required String password,
  }) async {
    _requireFirebase();
    await FirebaseAuth.instance.signInWithEmailAndPassword(
      email: email.trim(),
      password: password,
    );
  }

  Future<void> register({
    required String email,
    required String password,
    String? displayName,
  }) async {
    _requireFirebase();
    final credential =
        await FirebaseAuth.instance.createUserWithEmailAndPassword(
      email: email.trim(),
      password: password,
    );

    final name = displayName?.trim();
    if (name != null && name.isNotEmpty) {
      await credential.user?.updateDisplayName(name);
      // Without the reload the local User still reports a null displayName,
      // so the account button would show the email until the next sign-in.
      await credential.user?.reload();
    }
  }

  /// Sends a reset link, subject to the server's rate limit.
  ///
  /// Throws [PasswordResetCooldown] if the previous link is still inside the
  /// window. The wait is held by the Firestore rules rather than this app, so
  /// it survives a refresh, a new tab and a different browser alike.
  Future<void> sendPasswordReset(String email) async {
    _requireFirebase();
    await _resetThrottle.claim(email);
    await FirebaseAuth.instance.sendPasswordResetEmail(email: email.trim());
  }

  /// How long the server makes people wait between reset links, or null if the
  /// policy cannot be read. For display only.
  Future<Duration?> passwordResetCooldown() => _resetThrottle.cooldown();

  Future<void> signOut() async {
    if (!afFirebaseReady) return;
    await FirebaseAuth.instance.signOut();
  }
}

final authControllerProvider = Provider((ref) => AuthController());

/// Turns Firebase's error codes into something worth showing a person.
String describeAuthError(Object error) {
  if (error is! FirebaseAuthException) return 'Something went wrong. Try again.';

  return switch (error.code) {
    'unavailable' => 'Firebase is not configured on this build.',
    'popup-closed-by-user' ||
    'cancelled-popup-request' ||
    'web-context-canceled' =>
      'Sign-in cancelled.',
    'popup-blocked' => 'Your browser blocked the sign-in popup.',
    'network-request-failed' => 'No connection. Signing in needs the network.',
    // The provider is registered in the project but not switched on.
    'operation-not-allowed' =>
      'That sign-in method is not enabled in the Firebase console.',
    'account-exists-with-different-credential' =>
      'That email is already linked to a different sign-in method.',
    // Firebase deliberately blurs these so the form cannot be used to probe
    // which addresses have accounts; mirror that in the wording.
    'invalid-credential' || 'user-not-found' || 'wrong-password' =>
      'Email or password is incorrect.',
    'invalid-email' => 'That email address is not valid.',
    'user-disabled' => 'That account has been disabled.',
    'email-already-in-use' =>
      'That email already has an account — sign in instead.',
    'weak-password' => 'Use at least 6 characters for the password.',
    'too-many-requests' => 'Too many attempts. Wait a moment and try again.',
    _ => error.message ?? 'Something went wrong (${error.code}).',
  };
}
