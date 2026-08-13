import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

import '../firebase_options.dart';

/// Whether Firebase came up.
///
/// AF is local-first: if initialisation fails — bad config, no network on a
/// cold start, a platform without a registered app — every program still works
/// against Hive, and only sign-in and sync are unavailable. Nothing in the app
/// may assume this is true.
bool afFirebaseReady = false;

Future<void> initFirebase() async {
  try {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
    afFirebaseReady = true;
  } catch (error, stackTrace) {
    afFirebaseReady = false;
    debugPrint('Firebase unavailable, running local-only: $error');
    debugPrintStack(stackTrace: stackTrace);
  }
}
