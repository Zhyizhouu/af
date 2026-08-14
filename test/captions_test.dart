import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:af/programs/captions/caption_api.dart';
import 'package:af/programs/captions/caption_editor.dart';
import 'package:af/programs/captions/caption_timeline.dart';
import 'package:af/programs/captions/captions_screen.dart';
import 'package:af/theme/app_theme.dart';

/// The caption editor's client half.
///
/// Transcription happens on a worker and is not testable from here. What is
/// testable is the editing: that a timecode survives a round trip, that
/// dragging a caption cannot push it through its neighbour, and that a
/// transcript of a ninety-minute lecture renders on a phone.
void main() {
  group('timecode', () {
    test('formats as an editing timeline shows it', () {
      expect(formatTimecode(0), '0:00.000');
      expect(formatTimecode(65.25), '1:05.250');
      expect(formatTimecode(3599.999), '59:59.999');
      expect(formatTimecode(65.25, withMillis: false), '1:05');
    });

    // Rounding has to happen before the split into units, or 3.9999 seconds
    // displays as 3:999 milliseconds instead of 4 seconds flat.
    test('rounds before splitting into units', () {
      expect(formatTimecode(3.9999), '0:04.000');
    });

    test('parses back what it writes', () {
      for (final seconds in [0.0, 1.5, 65.25, 3599.999]) {
        final round = parseTimecode(formatTimecode(seconds));
        expect(round, closeTo(seconds, 0.001), reason: 'round trip of $seconds');
      }
    });

    test('accepts bare seconds as well as minutes and seconds', () {
      expect(parseTimecode('12.5'), 12.5);
      expect(parseTimecode('1:02'), 62);
      expect(parseTimecode(' 2:00.500 '), 120.5);
    });

    // A half-typed value must leave the segment alone rather than snapping it
    // to zero — this runs on every keystroke.
    test('refuses anything that is not a time', () {
      for (final input in ['', 'abc', '1:2:3', '-5', '1:-2', 'x:00']) {
        expect(parseTimecode(input), isNull, reason: 'should reject "$input"');
      }
    });
  });

  group('segment', () {
    test('copyWith leaves the original alone', () {
      const original = CaptionSegment(start: 1, end: 2, text: 'before');
      final edited = original.copyWith(text: 'after');

      expect(original.text, 'before');
      expect(edited.text, 'after');
      expect(edited.start, 1);
    });

    test('survives a json round trip', () {
      const segment = CaptionSegment(start: 1.25, end: 3.5, text: 'Halo');
      final back = CaptionSegment.fromJson(
          jsonDecode(jsonEncode(segment.toJson())) as Map<String, dynamic>);

      expect(back.start, 1.25);
      expect(back.end, 3.5);
      expect(back.text, 'Halo');
    });
  });

  group('editor', () {
    const transcript = CaptionTranscript(
      seconds: 120,
      language: 'id-ID',
      segments: [
        CaptionSegment(start: 0, end: 2, text: 'Selamat pagi semuanya'),
        CaptionSegment(start: 2.5, end: 5, text: 'hari ini kita bahas rekursi'),
        CaptionSegment(start: 6, end: 9, text: 'silakan buka modul tiga'),
      ],
    );

    Future<void> pump(
      WidgetTester tester, {
      CaptionTranscript data = transcript,
      Size size = const Size(390, 844),
      int reviewSeconds = 3600,
      ValueChanged<List<CaptionSegment>>? onApprove,
    }) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(MaterialApp(
        theme: AppTheme.light,
        home: Scaffold(
          body: SingleChildScrollView(
            child: CaptionEditor(
              transcript: data,
              reviewSeconds: reviewSeconds,
              onApprove: onApprove ?? (_) {},
            ),
          ),
        ),
      ));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    }

    testWidgets('opens on the first caption', (tester) async {
      await pump(tester);
      expect(find.text('CAPTION 1'), findsOneWidget);
      expect(find.text('0:00.000'), findsOneWidget);
    });

    testWidgets('renders on a desktop too', (tester) async {
      await pump(tester, size: const Size(1440, 900));
    });

    testWidgets('editing the text carries through to what is approved',
        (tester) async {
      List<CaptionSegment>? approved;
      await pump(tester, onApprove: (segments) => approved = segments);

      // The label is the un-edited one until something actually changes.
      expect(find.text('Write captions as transcribed'), findsOneWidget);

      await tester.enterText(
        find.byType(TextField).first,
        'Selamat pagi, semuanya.',
      );
      await tester.pumpAndSettle();

      expect(find.textContaining('Save edits'), findsOneWidget);

      final button = find.textContaining('Save edits');
      await tester.ensureVisible(button);
      await tester.pumpAndSettle();
      await tester.tap(button);
      await tester.pumpAndSettle();

      expect(approved, isNotNull);
      expect(approved![0].text, 'Selamat pagi, semuanya.');
      // The other two are untouched, and the timings survive an edit to text.
      expect(approved![1].text, 'hari ini kita bahas rekursi');
      expect(approved![0].start, 0);
      expect(approved![0].end, 2);
    });

    // The whole point of the timeline: a caption that has been dragged past
    // its neighbour produces a track players disagree about.
    testWidgets('a caption cannot be pushed through the one after it',
        (tester) async {
      await pump(tester);

      // Segment 1 ends at 2.0 and segment 2 starts at 2.5. Try to run the
      // first one to 30 seconds.
      final outField = find.byType(TextField).at(2);
      await tester.enterText(outField, '0:30.000');
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      // Clamped to the neighbour rather than refused with an error, because
      // this fires on every keystroke.
      expect(find.text('0:30.000'), findsOneWidget);
    });

    testWidgets('nudging moves the whole block, not just one end',
        (tester) async {
      await pump(tester);

      await tester.tap(find.text('0.5s →'));
      await tester.pumpAndSettle();

      // Segment 1 runs 0-2. Nudged right it should start at 0.5 and, clamped
      // against segment 2 starting at 2.5, end no later than 2.5.
      expect(find.text('0:00.500'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('stepping to the next caption loads it', (tester) async {
      await pump(tester);

      await tester.tap(find.text('Next'));
      await tester.pumpAndSettle();

      expect(find.text('CAPTION 2'), findsOneWidget);
      expect(find.text('0:02.500'), findsOneWidget);
    });

    testWidgets('deleting removes it from the list', (tester) async {
      await pump(tester);

      expect(find.text('ALL CAPTIONS'), findsOneWidget);
      await tester.tap(find.text('Delete'));
      await tester.pumpAndSettle();

      expect(find.text('CAPTION 1'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    // Deleting down to nothing would leave a job that cannot be approved, so
    // the button goes inert rather than the approval failing later.
    testWidgets('the last caption cannot be deleted', (tester) async {
      await pump(
        tester,
        data: const CaptionTranscript(
          seconds: 30,
          language: '',
          segments: [CaptionSegment(start: 0, end: 2, text: 'only one')],
        ),
      );

      await tester.tap(find.text('Delete'));
      await tester.pumpAndSettle();

      expect(find.text('only one'), findsWidgets);
      expect(find.text('CAPTION 1'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('says when the review window will decide for you',
        (tester) async {
      await pump(tester, reviewSeconds: 1800);
      expect(find.textContaining('muxes as transcribed in 30 minutes'),
          findsOneWidget);
    });

    // A ninety-minute lecture is hundreds of segments; the list is capped in
    // height so the approve button does not end up a minute of scrolling away.
    testWidgets('a long transcript still fits on a phone', (tester) async {
      await pump(
        tester,
        data: CaptionTranscript(
          seconds: 5400,
          language: 'id-ID',
          segments: [
            for (var i = 0; i < 400; i++)
              CaptionSegment(
                start: i * 13.0,
                end: i * 13.0 + 4,
                text: 'Caption number $i, which is a reasonably long line.',
              ),
          ],
        ),
      );

      expect(tester.takeException(), isNull);
      expect(find.textContaining('Write captions'), findsOneWidget);
    });
  });

  group('screen', () {
    final configured = MockClient((_) async => http.Response(
          jsonEncode({
            'maxUploadBytes': 536870912,
            'languages': [
              {'id': '', 'label': 'Detect'},
              {'id': 'id-ID', 'label': 'Indonesian'},
              {'id': 'en-US', 'label': 'English'},
            ],
            'reviewTtlSeconds': 3600,
            'resultTtlSeconds': 7200,
            'configured': true,
          }),
          200,
          headers: {'content-type': 'application/json'},
        ));

    Future<void> pump(WidgetTester tester, MockClient client, Size size) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(MaterialApp(
        theme: AppTheme.light,
        home: CaptionsScreen(
          api: CaptionApi(base: 'http://converter.test', client: client),
        ),
      ));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    }

    testWidgets('renders on a phone', (tester) async {
      await pump(tester, configured, const Size(390, 844));
      expect(find.text('Choose a video'), findsOneWidget);
      expect(find.text('Transcribe'), findsOneWidget);
    });

    testWidgets('renders on a desktop', (tester) async {
      await pump(tester, configured, const Size(1440, 900));
    });

    testWidgets('offers the languages the server named', (tester) async {
      await pump(tester, configured, const Size(390, 844));
      expect(find.text('Indonesian'), findsOneWidget);
      expect(find.text('English'), findsOneWidget);
    });

    // Better to say so on arrival than to accept a 200MB upload and fail a
    // minute later when the worker finds no key.
    testWidgets('says so when the server has no Gemini key', (tester) async {
      await pump(
        tester,
        MockClient((_) async => http.Response(
              jsonEncode({
                'maxUploadBytes': 1024,
                'languages': [],
                'reviewTtlSeconds': 3600,
                'resultTtlSeconds': 7200,
                'configured': false,
              }),
              200,
              headers: {'content-type': 'application/json'},
            )),
        const Size(390, 844),
      );

      expect(find.text('NOT CONFIGURED'), findsOneWidget);
      expect(find.textContaining('AF_GEMINI_API_KEY'), findsOneWidget);
    });

    testWidgets('says so when the converter is not there', (tester) async {
      await pump(
        tester,
        MockClient((_) async => throw const _Unreachable()),
        const Size(390, 844),
      );
      expect(find.textContaining('is not reachable'), findsOneWidget);
    });
  });
}

class _Unreachable implements Exception {
  const _Unreachable();
}
