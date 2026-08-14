import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:af/programs/mp3/mp3_api.dart';
import 'package:af/programs/mp3/mp3_job_panel.dart';
import 'package:af/programs/mp3/mp3_screen.dart';
import 'package:af/theme/app_theme.dart';

/// The MP3 converter's client half.
///
/// The conversion itself lives in the Go worker and is not testable from here.
/// What is testable is everything the browser does around it: how a server
/// answer becomes a job, how each of the five job states renders on a narrow
/// screen, and what happens when the converter is simply not there.
void main() {
  group('api', () {
    test('reads the limits the server publishes rather than assuming any', () async {
      final api = Mp3Api(
        base: 'http://converter.test',
        client: MockClient((request) async {
          expect(request.url.path, '/v1/limits');
          return http.Response(
            jsonEncode({
              'maxUploadBytes': 1048576,
              'bitrates': [96, 192],
              'defaultBitrate': 96,
              'resultTtlSeconds': 5400,
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final limits = await api.limits();

      expect(limits.maxUploadBytes, 1048576);
      expect(limits.bitrates, [96, 192]);
      expect(limits.defaultBitrate, 96);
      expect(limits.resultTtl, const Duration(minutes: 90));
    });

    test('surfaces the server\'s own wording for a refusal', () async {
      final api = Mp3Api(
        base: 'http://converter.test',
        client: MockClient((_) async => http.Response(
              jsonEncode({'error': 'Files are limited to 512 MB.'}),
              413,
            )),
      );

      await expectLater(
        api.limits(),
        throwsA(isA<Mp3Error>().having(
          (e) => e.message,
          'message',
          'Files are limited to 512 MB.',
        )),
      );
    });

    // A browser cannot tell a dead server from a CORS refusal, so the message
    // has to cover both without claiming to know which.
    test('names the endpoint when it cannot be reached at all', () async {
      final api = Mp3Api(
        base: 'http://converter.test',
        client: MockClient((_) async => throw const SocketishFailure()),
      );

      await expectLater(
        api.limits(),
        throwsA(isA<Mp3Error>().having(
          (e) => e.message,
          'message',
          contains('http://converter.test'),
        )),
      );
    });

    test('a gone job is marked gone so the UI can drop it', () async {
      final api = Mp3Api(
        base: 'http://converter.test',
        token: () async => 'id-token',
        client: MockClient((request) async {
          expect(request.headers['Authorization'], 'Bearer id-token');
          return http.Response(
            jsonEncode({'error': 'That conversion has expired.'}),
            410,
          );
        }),
      );

      await expectLater(
        api.status('job-1'),
        throwsA(isA<Mp3Error>().having((e) => e.gone, 'gone', isTrue)),
      );
    });

    // Without a token there is nothing to send. Reporting that as a transport
    // failure would send somebody off to check a converter that is fine.
    test('no signed-in user reads as a sign-in problem, not a network one',
        () async {
      final api = Mp3Api(
        base: 'http://converter.test',
        token: () async => null,
        client: MockClient((_) async => fail('should never be sent')),
      );

      await expectLater(
        api.status('job-1'),
        throwsA(isA<Mp3Error>().having(
          (e) => e.message,
          'message',
          'Sign in to convert files.',
        )),
      );
    });

    test('a trailing slash on the base url does not double up', () {
      expect(Mp3Api(base: 'http://converter.test/').base, 'http://converter.test');
    });
  });

  group('job panel', () {
    // Every stage on the narrowest screen AF supports. The filename is
    // deliberately absurd: it is the value most likely to overflow the row.
    const longName = 'UAS-Semester-Ganjil-2026-Rekaman-Ruang-401-Sesi-Pagi.mkv';

    Future<void> pump(WidgetTester tester, Mp3Job job, {ThemeMode? mode}) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(MaterialApp(
        theme: AppTheme.light,
        darkTheme: AppTheme.dark,
        themeMode: mode ?? ThemeMode.light,
        home: Scaffold(
          body: SingleChildScrollView(child: Mp3JobPanel(job: job)),
        ),
      ));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    }

    testWidgets('queued', (tester) async {
      await pump(tester, const Mp3Job(id: 'a', stage: 'queued', sourceName: longName));
      expect(find.textContaining('Queued'), findsOneWidget);
      expect(find.text('Cancel'), findsOneWidget);
    });

    testWidgets('encoding shows the percentage the worker reported', (tester) async {
      await pump(
        tester,
        const Mp3Job(
          id: 'a',
          stage: 'transcoding',
          step: 'encoding',
          percent: 0.42,
          bitrate: 192,
          sourceName: longName,
        ),
      );
      expect(find.textContaining('Encoding at 192 kbit/s — 42%'), findsOneWidget);
    });

    // The activity is scheduled but has not heartbeated yet, so there is no
    // percentage to show. Rendering "0%" would read as stalled.
    testWidgets('transcoding without a heartbeat says so', (tester) async {
      await pump(
        tester,
        const Mp3Job(id: 'a', stage: 'transcoding', sourceName: longName),
      );
      expect(find.text('Starting up'), findsOneWidget);
    });

    testWidgets('ready offers the download', (tester) async {
      await pump(
        tester,
        const Mp3Job(
          id: 'a',
          stage: 'ready',
          percent: 1,
          sourceName: longName,
          resultName: 'UAS-Semester-Ganjil-2026-Rekaman-Ruang-401-Sesi-Pagi.mp3',
          sizeBytes: 7 * 1024 * 1024,
          seconds: 754,
          downloadable: true,
        ),
      );
      expect(find.textContaining('Ready — 7.0 MB'), findsOneWidget);
      expect(find.textContaining('Download'), findsOneWidget);
      // The source's running time, not the conversion's.
      expect(find.text('12:34'), findsOneWidget);
    });

    testWidgets('failed shows the reason and no buttons', (tester) async {
      await pump(
        tester,
        const Mp3Job(
          id: 'a',
          stage: 'failed',
          sourceName: longName,
          error: 'that file has no audio track to convert',
        ),
      );
      expect(find.text('that file has no audio track to convert'), findsOneWidget);
      expect(find.text('Cancel'), findsNothing);
      expect(find.textContaining('Download'), findsNothing);
    });

    testWidgets('expired in dark mode', (tester) async {
      await pump(
        tester,
        const Mp3Job(id: 'a', stage: 'expired', sourceName: longName),
        mode: ThemeMode.dark,
      );
      expect(find.textContaining('Expired'), findsOneWidget);
    });
  });

  group('screen', () {
    Future<void> pump(WidgetTester tester, MockClient client, Size size) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(MaterialApp(
        theme: AppTheme.light,
        home: Mp3Screen(
          api: Mp3Api(base: 'http://converter.test', client: client),
        ),
      ));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    }

    final answering = MockClient((_) async => http.Response(
          jsonEncode({
            'maxUploadBytes': 536870912,
            'bitrates': [128, 192, 256, 320],
            'defaultBitrate': 192,
            'resultTtlSeconds': 7200,
          }),
          200,
          headers: {'content-type': 'application/json'},
        ));

    testWidgets('renders on a phone', (tester) async {
      await pump(tester, answering, const Size(390, 844));
      expect(find.text('Choose a file'), findsOneWidget);
      expect(find.text('Convert to MP3'), findsOneWidget);
      expect(find.textContaining('deleted after 2 hours'), findsOneWidget);
    });

    testWidgets('renders on a desktop', (tester) async {
      await pump(tester, answering, const Size(1280, 900));
    });

    testWidgets('offers the bitrates the server named, not a hardcoded set',
        (tester) async {
      await pump(
        tester,
        MockClient((_) async => http.Response(
              jsonEncode({
                'maxUploadBytes': 1024,
                'bitrates': [64, 96],
                'defaultBitrate': 64,
                'resultTtlSeconds': 600,
              }),
              200,
              headers: {'content-type': 'application/json'},
            )),
        const Size(390, 844),
      );

      expect(find.text('64'), findsOneWidget);
      expect(find.text('96'), findsOneWidget);
      expect(find.text('320'), findsNothing);
      expect(find.text('64 kbit/s'), findsOneWidget);
    });

    // The whole program depends on a service that may not be running. Saying
    // so on arrival beats letting somebody pick a 200MB file and find out.
    testWidgets('says so when the converter is not there', (tester) async {
      await pump(
        tester,
        MockClient((_) async => throw const SocketishFailure()),
        const Size(390, 844),
      );
      expect(find.textContaining('is not reachable'), findsOneWidget);
    });
  });
}

/// Stands in for the transport failures a browser reports opaquely.
class SocketishFailure implements Exception {
  const SocketishFailure();
}
