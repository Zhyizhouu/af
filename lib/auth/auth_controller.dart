import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../app/firebase_init.dart';

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

class AuthController {
  const AuthController();

  /// Google sign-in.
  ///
  /// Uses `firebase_auth`'s own provider flows rather than the `google_sign_in`
  /// plugin: a popup on web, and the native/Custom Tabs flow elsewhere. That
  /// keeps one dependency out of the tree and one fewer API to track.
  Future<void> signInWithGoogle() async {
    if (!afFirebaseReady) {
      throw FirebaseAuthException(
        code: 'unavailable',
        message: 'Firebase is not configured on this build.',
      );
    }

    final provider = GoogleAuthProvider()..addScope('email');

    if (kIsWeb) {
      await FirebaseAuth.instance.signInWithPopup(provider);
    } else {
      await FirebaseAuth.instance.signInWithProvider(provider);
    }
  }

  Future<void> signOut() async {
    if (!afFirebaseReady) return;
    await FirebaseAuth.instance.signOut();
  }
}

final authControllerProvider = Provider((ref) => const AuthController());

/// Turns Firebase's error codes into something worth showing a person.
String describeAuthError(Object error) {
  if (error is! FirebaseAuthException) return 'Sign-in failed. Try again.';

  return switch (error.code) {
    'unavailable' => 'Firebase is not configured on this build.',
    'popup-closed-by-user' ||
    'cancelled-popup-request' ||
    'web-context-canceled' =>
      'Sign-in cancelled.',
    'popup-blocked' => 'Your browser blocked the sign-in popup.',
    'network-request-failed' => 'No connection. Sign-in needs the network.',
    // Google is registered in the project but not switched on as a provider.
    'operation-not-allowed' =>
      'Google sign-in is not enabled in the Firebase console.',
    'account-exists-with-different-credential' =>
      'That email is already linked to a different sign-in method.',
    _ => error.message ?? 'Sign-in failed (${error.code}).',
  };
}
