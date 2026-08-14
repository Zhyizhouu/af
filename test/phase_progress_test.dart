import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:af/theme/app_theme.dart';
import 'package:af/widgets/af_phase_progress.dart';

/// The progress bar both converters share.
///
/// What it has to get right is not the arithmetic but the honesty: a job that
/// has expired must not read as working, a failed one must not read as done,
/// and a step with nothing to report must not pretend to a percentage.
void main() {
  const phases = [
    AFPhase(id: 'uploading', label: 'Uploading', explanation: 'Sending it up.'),
    AFPhase(id: 'queued', label: 'Queued', explanation: 'Waiting for a worker.'),
    AFPhase(id: 'encoding', label: 'Encoding', explanation: 'ffmpeg is working.'),
    AFPhase(id: 'storing', label: 'Storing', explanation: 'Saving the result.'),
  ];

  Future<void> pump(
    WidgetTester tester, {
    required String activeId,
    double? fraction,
    bool failed = false,
    bool done = false,
    String? message,
    String? heading,
    ThemeMode mode = ThemeMode.light,
    Size size = const Size(390, 844),
  }) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: mode,
      home: Scaffold(
        body: SingleChildScrollView(
          child: AFPhaseProgress(
            phases: phases,
            activeId: activeId,
            phaseFraction: fraction,
            failed: failed,
            done: done,
            message: message,
            heading: heading,
          ),
        ),
      ),
    ));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  }

  testWidgets('names the active phase and explains it', (tester) async {
    await pump(tester, activeId: 'encoding', fraction: 0.5);

    expect(find.text('Encoding'), findsOneWidget);
    expect(find.text('ffmpeg is working.'), findsOneWidget);
    expect(find.text('3/4'), findsOneWidget);
  });

  // A step that has not heartbeated yet still has to show where the job is.
  testWidgets('an active phase with no percentage still reads as active',
      (tester) async {
    await pump(tester, activeId: 'queued', fraction: null);

    expect(find.text('Queued'), findsOneWidget);
    expect(find.text('2/4'), findsOneWidget);
  });

  testWidgets('a finished job says done and drops the step counter',
      (tester) async {
    await pump(tester, activeId: 'storing', done: true);

    expect(find.text('Done'), findsOneWidget);
    expect(find.textContaining('ready to download'), findsOneWidget);
    expect(find.text('4/4'), findsNothing);
  });

  testWidgets('a failed job says failed, not done', (tester) async {
    await pump(
      tester,
      activeId: 'encoding',
      failed: true,
      message: 'that file has no audio track',
    );

    expect(find.text('Failed'), findsOneWidget);
    expect(find.text('Done'), findsNothing);
    expect(find.text('that file has no audio track'), findsOneWidget);
  });

  // Expired is neither working nor done. Without the override it would land on
  // "Working", which is the one thing it definitely is not.
  testWidgets('an unknown stage can override the heading', (tester) async {
    await pump(
      tester,
      activeId: 'expired',
      heading: 'Expired',
      message: 'These files have been deleted.',
    );

    expect(find.text('Expired'), findsOneWidget);
    expect(find.text('Working'), findsNothing);
    expect(find.text('Done'), findsNothing);
  });

  testWidgets('an unrecognised stage with no override reads as working',
      (tester) async {
    await pump(tester, activeId: 'something-new');

    expect(find.text('Working'), findsOneWidget);
    expect(find.textContaining('Waiting for the converter'), findsOneWidget);
  });

  testWidgets('a supplied message replaces the stock explanation',
      (tester) async {
    await pump(
      tester,
      activeId: 'encoding',
      message: 'ffmpeg is encoding MP3 at 320 kbit/s.',
    );

    expect(find.text('ffmpeg is encoding MP3 at 320 kbit/s.'), findsOneWidget);
    expect(find.text('ffmpeg is working.'), findsNothing);
  });

  testWidgets('renders in dark mode and on a desktop', (tester) async {
    await pump(tester, activeId: 'encoding', fraction: 0.5, mode: ThemeMode.dark);
    await pump(tester, activeId: 'encoding', fraction: 0.5, size: const Size(1440, 900));
  });

  // Eight phases at 390px is the caption program's real layout.
  testWidgets('a long phase list survives a phone', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.light,
      home: Scaffold(
        body: AFPhaseProgress(
          phases: [
            for (var i = 0; i < 8; i++)
              AFPhase(
                id: 'p$i',
                label: 'Phase $i',
                explanation: 'A reasonably long sentence explaining phase $i.',
              ),
          ],
          activeId: 'p4',
          phaseFraction: 0.5,
        ),
      ),
    ));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.text('5/8'), findsOneWidget);
  });
}
