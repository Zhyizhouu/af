import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:af/app/upload.dart';
import 'package:af/programs/audio/audio_api.dart';
import 'package:af/programs/audio/audio_job_panel.dart';
import 'package:af/programs/audio/audio_screen.dart';
import 'package:af/theme/app_theme.dart';

/// The audio converter's client half.
///
/// The conversion itself lives in the Go worker and is not testable from here.
/// What is testable is everything the browser does around it: how a server
/// answer becomes a job, how each job state renders on a narrow screen, that
/// the format list comes from the server rather than this file, and what
/// happens when the converter is simply not there.
void main() {
  /// The shape `GET /v1/limits` returns, trimmed to what the tests need.
  String limitsBody({
    List<Map<String, Object>>? formats,
    String defaultFormat = 'mp3',
    List<int> bitrates = const [128, 192, 256, 320],
    int defaultBitrate = 192,
    int maxUploadBytes = 536870912,
    int ttlSeconds = 7200,
  }) =>
      jsonEncode({
        'maxUploadBytes': maxUploadBytes,
        'formats': formats ??
            [
              {
                'id': 'mp3',
                'label': 'MP3',
                'extension': 'mp3',
                'lossy': true,
                'note': 'plays everywhere',
              },
              {
                'id': 'wav',
                'label': 'WAV',
                'extension': 'wav',
                'lossy': false,
                'note': 'uncompressed — expect roughly 10MB a minute',
              },
              {
                'id': 'flac',
                'label': 'FLAC',
                'extension': 'flac',
                'lossy': false,
                'note': 'lossless, about half the size of WAV',
              },
              {
                'id': 'opus',
                'label': 'Opus',
                'extension': 'opus',
                'lossy': true,
                'note': 'best quality per byte',
              },
            ],
        'defaultFormat': defaultFormat,
        'bitrates': bitrates,
        'defaultBitrate': defaultBitrate,
        'resultTtlSeconds': ttlSeconds,
      });

  MockClient answering([String? body]) => MockClient((_) async => http.Response(
        body ?? limitsBody(),
        200,
        headers: {'content-type': 'application/json'},
      ));

  group('api', () {
    test('reads the format menu from the server', () async {
      final api = AudioApi(
        base: 'http://converter.test',
        token: () async => 'id-token',
        client: answering(),
      );
      final limits = await api.limits();

      expect(limits.formats.map((f) => f.id), ['mp3', 'wav', 'flac', 'opus']);
      expect(limits.formatById('wav')!.lossy, isFalse);
      expect(limits.formatById('opus')!.lossy, isTrue);
      expect(limits.formatById('nope'), isNull);
      expect(limits.resultTtl, const Duration(hours: 2));
    });

    // The endpoint is account-scoped on the server like every other one, so a
    // request without a token is one the server is about to refuse anyway.
    test('even reading the format menu is signed', () async {
      String? authorization;
      final api = AudioApi(
        base: 'http://converter.test',
        token: () async => 'id-token',
        client: MockClient((request) async {
          authorization = request.headers['Authorization'];
          return http.Response(limitsBody(), 200,
              headers: {'content-type': 'application/json'});
        }),
      );

      await api.limits();
      expect(authorization, 'Bearer id-token');
    });

    test('sends the chosen format and bitrate as query parameters', () async {
      late Uri seen;
      late String seenAuth;
      final api = AudioApi(
        base: 'http://converter.test',
        token: () async => 'id-token',
        uploader: ({
          required url,
          required headers,
          required bytes,
          required fileName,
          required fieldName,
          required onProgress,
        }) async {
          seen = url;
          seenAuth = headers['Authorization'] ?? '';
          return UploadResponse(
            202,
            jsonEncode({'id': 'job-1', 'stage': 'queued', 'format': 'flac'}),
          );
        },
      );

      final job = await api.submit(
        bytes: Uint8List.fromList([1, 2, 3]),
        fileName: 'lecture.m4a',
        format: 'flac',
        bitrate: 256,
      );

      expect(seen.queryParameters['format'], 'flac');
      expect(seen.queryParameters['bitrate'], '256');
      expect(seenAuth, 'Bearer id-token');
      expect(job.format, 'flac');
    });

    // The upload is the longest phase for a large file, and the only one whose
    // duration is knowable while it happens.
    test('reports upload progress to the caller', () async {
      final seen = <double>[];
      final api = AudioApi(
        base: 'http://converter.test',
        token: () async => 'id-token',
        uploader: ({
          required url,
          required headers,
          required bytes,
          required fileName,
          required fieldName,
          required onProgress,
        }) async {
          for (final fraction in [0.0, 0.25, 0.5, 0.75, 1.0]) {
            onProgress(fraction);
          }
          return UploadResponse(
            202, jsonEncode({'id': 'job-1', 'stage': 'queued'}));
        },
      );

      await api.submit(
        bytes: Uint8List.fromList([1, 2, 3]),
        fileName: 'lecture.m4a',
        format: 'mp3',
        bitrate: 192,
        onProgress: seen.add,
      );

      expect(seen, [0.0, 0.25, 0.5, 0.75, 1.0]);
    });

    // A refusal during upload has to read the same as one from any other
    // call — the uploader is a different code path but not a different API.
    test('an upload refusal carries the server\'s message', () async {
      final api = AudioApi(
        base: 'http://converter.test',
        token: () async => 'id-token',
        uploader: ({
          required url,
          required headers,
          required bytes,
          required fileName,
          required fieldName,
          required onProgress,
        }) async =>
            UploadResponse(413, jsonEncode({'error': 'Files are limited to 512 MB.'})),
      );

      await expectLater(
        api.submit(
          bytes: Uint8List.fromList([1]),
          fileName: 'huge.mkv',
          format: 'mp3',
          bitrate: 192,
        ),
        throwsA(isA<AudioError>().having(
          (e) => e.message,
          'message',
          'Files are limited to 512 MB.',
        )),
      );
    });

    test('surfaces the server\'s own wording for a refusal', () async {
      final api = AudioApi(
        base: 'http://converter.test',
        token: () async => 'id-token',
        client: MockClient((_) async => http.Response(
              jsonEncode({'error': 'Files are limited to 512 MB.'}),
              413,
            )),
      );

      await expectLater(
        api.limits(),
        throwsA(isA<AudioError>().having(
          (e) => e.message,
          'message',
          'Files are limited to 512 MB.',
        )),
      );
    });

    // A browser cannot tell a dead server from a CORS refusal, so the message
    // has to cover both without claiming to know which.
    test('names the endpoint when it cannot be reached at all', () async {
      final api = AudioApi(
        base: 'http://converter.test',
        token: () async => 'id-token',
        client: MockClient((_) async => throw const SocketishFailure()),
      );

      await expectLater(
        api.limits(),
        throwsA(isA<AudioError>().having(
          (e) => e.message,
          'message',
          contains('http://converter.test'),
        )),
      );
    });

    test('a gone job is marked gone so the UI can drop it', () async {
      final api = AudioApi(
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
        throwsA(isA<AudioError>().having((e) => e.gone, 'gone', isTrue)),
      );
    });

    // Without a token there is nothing to send. Reporting that as a transport
    // failure would send somebody off to check a converter that is fine.
    test('no signed-in user reads as a sign-in problem, not a network one',
        () async {
      final api = AudioApi(
        base: 'http://converter.test',
        token: () async => null,
        client: MockClient((_) async => fail('should never be sent')),
      );

      await expectLater(
        api.status('job-1'),
        throwsA(isA<AudioError>().having(
          (e) => e.message,
          'message',
          'Sign in to convert files.',
        )),
      );
    });

    test('a trailing slash on the base url does not double up', () {
      expect(
        AudioApi(base: 'http://converter.test/').base,
        'http://converter.test',
      );
    });
  });

  group('job panel', () {
    // Every stage on the narrowest screen AF supports. The filename is
    // deliberately absurd: it is the value most likely to overflow the row.
    const longName = 'UAS-Semester-Ganjil-2026-Rekaman-Ruang-401-Sesi-Pagi.mkv';

    Future<void> pump(
      WidgetTester tester,
      AudioJob job, {
      ThemeMode? mode,
      double? uploadFraction,
    }) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(MaterialApp(
        theme: AppTheme.light,
        darkTheme: AppTheme.dark,
        themeMode: mode ?? ThemeMode.light,
        home: Scaffold(
          body: SingleChildScrollView(
            child: AudioJobPanel(job: job, uploadFraction: uploadFraction),
          ),
        ),
      ));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    }

    testWidgets('queued', (tester) async {
      await pump(
        tester,
        const AudioJob(id: 'a', stage: 'queued', sourceName: longName),
      );
      expect(find.textContaining('Queued'), findsOneWidget);
      expect(find.text('Cancel'), findsOneWidget);
    });

    // The job does not exist server-side yet, so the panel runs off the
    // upload fraction alone.
    testWidgets('uploading shows its own phase', (tester) async {
      await pump(
        tester,
        const AudioJob(id: '', stage: 'uploading', sourceName: longName),
        uploadFraction: 0.4,
      );
      expect(find.text('Uploading'), findsOneWidget);
      expect(find.textContaining('Sending your file'), findsOneWidget);
      expect(find.text('1/5'), findsOneWidget);
    });

    testWidgets('encoding a lossy format names the bitrate', (tester) async {
      await pump(
        tester,
        const AudioJob(
          id: 'a',
          stage: 'transcoding',
          step: 'encoding',
          percent: 0.42,
          format: 'mp3',
          bitrate: 192,
          sourceName: longName,
        ),
      );
      expect(find.text('Encoding'), findsOneWidget);
      expect(find.textContaining('encoding MP3 at 192 kbit/s'), findsOneWidget);
      // Fourth of five phases.
      expect(find.text('4/5'), findsOneWidget);
    });

    // The gateway zeroes the bitrate for lossless output, so there is no
    // number to show. "WAV at 192 kbit/s" would describe a setting that was
    // never applied to anything.
    testWidgets('encoding a lossless format names no bitrate', (tester) async {
      await pump(
        tester,
        const AudioJob(
          id: 'a',
          stage: 'transcoding',
          step: 'encoding',
          percent: 0.6,
          format: 'wav',
          sourceName: longName,
        ),
      );
      expect(find.text('Encoding'), findsOneWidget);
      expect(find.textContaining('kbit/s'), findsNothing);
    });

    // No heartbeat has landed, so the activity is scheduled but not started —
    // still the reading step from anybody's point of view.
    testWidgets('transcoding without a heartbeat shows the reading phase',
        (tester) async {
      await pump(
        tester,
        const AudioJob(id: 'a', stage: 'transcoding', sourceName: longName),
      );
      expect(find.text('Reading'), findsOneWidget);
      expect(find.textContaining('pulling your file out of storage'),
          findsOneWidget);
    });

    testWidgets('ready offers the download', (tester) async {
      await pump(
        tester,
        const AudioJob(
          id: 'a',
          stage: 'ready',
          percent: 1,
          format: 'flac',
          sourceName: longName,
          resultName: 'UAS-Semester-Ganjil-2026-Rekaman-Ruang-401-Sesi-Pagi.flac',
          sizeBytes: 7 * 1024 * 1024,
          seconds: 754,
          downloadable: true,
        ),
      );
      expect(find.text('Done'), findsOneWidget);
      expect(find.textContaining('Converted to FLAC'), findsOneWidget);
      expect(find.textContaining('7.0 MB'), findsOneWidget);
      // Says plainly what became of the upload.
      expect(find.textContaining('has been deleted'), findsOneWidget);
      expect(find.textContaining('.flac'), findsWidgets);
      // The source's running time, not the conversion's.
      expect(find.text('12:34'), findsOneWidget);
    });

    testWidgets('failed shows the reason and no buttons', (tester) async {
      await pump(
        tester,
        const AudioJob(
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

    // Neither working nor done, so it must say neither.
    testWidgets('expired in dark mode', (tester) async {
      await pump(
        tester,
        const AudioJob(id: 'a', stage: 'expired', sourceName: longName),
        mode: ThemeMode.dark,
      );
      expect(find.text('Expired'), findsOneWidget);
      expect(find.text('Working'), findsNothing);
      expect(find.text('Done'), findsNothing);
      expect(find.textContaining('Convert the file again'), findsOneWidget);
    });
  });

  group('screen', () {
    Future<void> pump(WidgetTester tester, MockClient client, Size size) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(MaterialApp(
        theme: AppTheme.light,
        home: AudioScreen(
          api: AudioApi(
            base: 'http://converter.test',
            token: () async => 'id-token',
            client: client,
          ),
        ),
      ));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    }

    testWidgets('renders on a phone', (tester) async {
      await pump(tester, answering(), const Size(390, 844));
      expect(find.text('Choose a file'), findsOneWidget);
      expect(find.text('Convert to MP3'), findsOneWidget);
      expect(find.textContaining('deleted after 2 hours'), findsOneWidget);
    });

    testWidgets('renders on a desktop', (tester) async {
      await pump(tester, answering(), const Size(1280, 900));
    });

    testWidgets('offers every format the server named', (tester) async {
      await pump(tester, answering(), const Size(390, 844));

      // At least once rather than exactly once: the selected format also
      // appears as the field's read-out, so MP3 is legitimately on screen
      // twice while the others are on it once.
      for (final label in ['MP3', 'WAV', 'FLAC', 'Opus']) {
        expect(find.text(label), findsWidgets, reason: '$label should be offered');
      }
      // The note is the server's copy, not a string in the app.
      expect(find.text('plays everywhere'), findsOneWidget);
    });

    // A bitrate control on a lossless format is a setting that changes
    // nothing, so it goes away rather than sitting there disabled.
    testWidgets('picking a lossless format hides the bitrate', (tester) async {
      await pump(tester, answering(), const Size(390, 844));
      expect(find.textContaining('kbit/s'), findsWidgets);

      await tester.tap(find.text('WAV'));
      await tester.pumpAndSettle();

      expect(find.textContaining('kbit/s'), findsNothing);
      expect(find.text('Convert to WAV'), findsOneWidget);
      expect(find.textContaining('10MB a minute'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('and picking a lossy one brings it back', (tester) async {
      await pump(tester, answering(), const Size(390, 844));

      await tester.tap(find.text('FLAC'));
      await tester.pumpAndSettle();
      expect(find.textContaining('kbit/s'), findsNothing);

      await tester.tap(find.text('Opus'));
      await tester.pumpAndSettle();
      expect(find.textContaining('kbit/s'), findsWidgets);
      expect(find.text('Convert to Opus'), findsOneWidget);
    });

    testWidgets('honours the server\'s default format', (tester) async {
      await pump(
        tester,
        answering(limitsBody(defaultFormat: 'opus')),
        const Size(390, 844),
      );
      expect(find.text('Convert to Opus'), findsOneWidget);
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
