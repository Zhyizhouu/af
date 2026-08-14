import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:af/programs/ai/ai_api.dart';
import 'package:af/programs/ai/ai_proposal_card.dart';
import 'package:af/programs/ai/ai_screen.dart';
import 'package:af/programs/calendar/category_provider.dart';
import 'package:af/programs/calendar/event_category.dart';
import 'package:af/theme/app_theme.dart';

/// The assistant's client half.
///
/// The model runs on the server and is not testable from here. What is
/// testable is everything protecting the calendar from it: that a malformed
/// proposal is dropped rather than shown, that a missing field is visible
/// rather than blank, and that nothing is written until the button is pressed.
void main() {
  String planBody({
    List<Map<String, Object>> sessions = const [],
    List<Map<String, Object>> events = const [],
    String note = '',
  }) =>
      jsonEncode({'sessions': sessions, 'events': events, 'note': note});

  MockClient answering(String body, [int status = 200]) =>
      MockClient((_) async => http.Response(
            body,
            status,
            headers: {'content-type': 'application/json'},
          ));

  group('api', () {
    test('reads sessions and events out of an answer', () async {
      final api = AiApi(
        base: 'http://converter.test',
        token: () async => 'id-token',
        client: answering(planBody(
          sessions: [
            {
              'type': 'UAP',
              'start': '2026-08-17 09:00',
              'room': '401',
              'courseCode': 'COMP6047',
              'courseName': 'Algorithm and Programming',
              'courseClass': 'BAA1',
            }
          ],
          events: [
            {
              'title': 'Lunch with Dina',
              'notes': '',
              'start': '2026-08-19 12:00',
              'end': '2026-08-19 13:00',
              'allDay': false,
              'category': 'social',
            }
          ],
          note: 'I assumed 2026.',
        )),
      );

      final plan = await api.plan(
        prompt: 'anything',
        now: DateTime(2026, 8, 15, 9),
        categories: const ['social', 'other'],
      );

      expect(plan.sessions, hasLength(1));
      expect(plan.sessions.single.type, 'UAP');
      expect(plan.sessions.single.start, DateTime(2026, 8, 17, 9));
      expect(plan.sessions.single.label, 'COMP6047 · Algorithm and Programming');
      expect(plan.events.single.title, 'Lunch with Dina');
      expect(plan.note, 'I assumed 2026.');
      expect(plan.total, 2);
    });

    // The server normalises too, but a proposal that arrives unreadable must
    // never reach the review list — an entry nobody can check is worse than a
    // missing one.
    test('a proposal with an unreadable time is dropped, not shown', () async {
      final api = AiApi(
        base: 'http://converter.test',
        token: () async => 'id-token',
        client: answering(planBody(events: [
          {
            'title': 'Broken',
            'notes': '',
            'start': 'next tuesday',
            'end': '2026-08-19 13:00',
            'allDay': false,
            'category': 'work',
          },
          {
            'title': 'Fine',
            'notes': '',
            'start': '2026-08-19 12:00',
            'end': '2026-08-19 13:00',
            'allDay': false,
            'category': 'work',
          },
        ])),
      );

      final plan = await api.plan(
        prompt: 'anything',
        now: DateTime(2026, 8, 15, 9),
        categories: const ['work'],
      );

      expect(plan.events, hasLength(1));
      expect(plan.events.single.title, 'Fine');
    });

    test('an end at or before its start becomes an hour', () async {
      final api = AiApi(
        base: 'http://converter.test',
        token: () async => 'id-token',
        client: answering(planBody(events: [
          {
            'title': 'Backwards',
            'notes': '',
            'start': '2026-08-19 12:00',
            'end': '2026-08-19 09:00',
            'allDay': false,
            'category': 'work',
          }
        ])),
      );

      final plan = await api.plan(
        prompt: 'anything',
        now: DateTime(2026, 8, 15, 9),
        categories: const ['work'],
      );

      expect(plan.events.single.end, DateTime(2026, 8, 19, 13));
    });

    // Waiting is the fix for a quota, and retrying immediately is not — so the
    // UI needs to be able to tell this apart from a broken server.
    test('a quota refusal is marked throttled', () async {
      final api = AiApi(
        base: 'http://converter.test',
        token: () async => 'id-token',
        client: answering(
          jsonEncode({'error': 'The assistant has hit its quota for now.'}),
          429,
        ),
      );

      await expectLater(
        api.plan(
            prompt: 'x', now: DateTime(2026, 8, 15), categories: const ['work']),
        throwsA(isA<AiError>().having((e) => e.throttled, 'throttled', isTrue)),
      );
    });

    test('names the endpoint when it cannot be reached', () async {
      final api = AiApi(
        base: 'http://converter.test',
        token: () async => 'id-token',
        client: MockClient((_) async => throw const _Unreachable()),
      );

      await expectLater(
        api.limits(),
        throwsA(isA<AiError>().having(
          (e) => e.message,
          'message',
          contains('http://converter.test'),
        )),
      );
    });

    test('no signed-in user reads as a sign-in problem', () async {
      final api = AiApi(
        base: 'http://converter.test',
        token: () async => null,
        client: MockClient((_) async => fail('should never be sent')),
      );

      await expectLater(
        api.plan(
            prompt: 'x', now: DateTime(2026, 8, 15), categories: const ['work']),
        throwsA(isA<AiError>().having(
          (e) => e.message,
          'message',
          'Sign in to use the assistant.',
        )),
      );
    });
  });

  group('proposal cards', () {
    Future<void> pump(WidgetTester tester, Widget child,
        {Size size = const Size(390, 844)}) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(MaterialApp(
        theme: AppTheme.light,
        home: Scaffold(body: SingleChildScrollView(child: child)),
      ));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    }

    testWidgets('a session shows what it will create', (tester) async {
      await pump(
        tester,
        SessionProposalCard(
          proposal: SessionProposal(
            type: 'UAP',
            start: DateTime(2026, 8, 17, 9),
            room: '401',
            courseCode: 'COMP6047',
            courseName: 'Algorithm and Programming',
            courseClass: 'BAA1',
          ),
        ),
      );

      expect(find.text('UAP'), findsOneWidget);
      expect(find.textContaining('COMP6047'), findsOneWidget);
      expect(find.text('401'), findsOneWidget);
      expect(find.text('BAA1'), findsOneWidget);
    });

    // A blank room is exactly the thing worth catching before confirming, so
    // it is shown as missing rather than as an empty gap.
    testWidgets('a field the model could not fill is called out',
        (tester) async {
      await pump(
        tester,
        SessionProposalCard(
          proposal: SessionProposal(
            type: 'UAS',
            start: DateTime(2026, 8, 17, 9),
            room: '',
            courseCode: 'COMP6047',
            courseName: 'Algorithm',
            courseClass: '',
          ),
        ),
      );

      expect(find.text('— not given'), findsNWidgets(2));
    });

    testWidgets('an event shows its category and span', (tester) async {
      await pump(
        tester,
        EventProposalCard(
          proposal: EventProposal(
            title: 'Lunch with Dina',
            notes: 'At the canteen',
            start: DateTime(2026, 8, 19, 12),
            end: DateTime(2026, 8, 19, 13),
            allDay: false,
            category: 'social',
          ),
          category: builtInCategories.firstWhere((c) => c.slug == 'social'),
        ),
      );

      expect(find.text('Lunch with Dina'), findsOneWidget);
      expect(find.text('Social'), findsOneWidget);
      expect(find.textContaining('12:00–13:00'), findsOneWidget);
      expect(find.text('At the canteen'), findsOneWidget);
    });

    testWidgets('an all-day event says so instead of showing 00:00',
        (tester) async {
      await pump(
        tester,
        EventProposalCard(
          proposal: EventProposal(
            title: 'Public holiday',
            notes: '',
            start: DateTime(2026, 8, 30),
            end: DateTime(2026, 8, 30, 23, 59),
            allDay: true,
            category: 'other',
          ),
          category: fallbackCategory,
        ),
      );

      expect(find.textContaining('all day'), findsOneWidget);
      expect(find.textContaining('00:00'), findsNothing);
    });
  });

  group('screen', () {
    Future<void> pump(
      WidgetTester tester,
      MockClient client, {
      Size size = const Size(390, 844),
    }) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(ProviderScope(
        overrides: [
          categoriesProvider.overrideWith((ref) async => builtInCategories),
        ],
        child: MaterialApp(
          theme: AppTheme.light,
          // AFShell owns the Scaffold in the real app; the prompt field needs
          // a Material ancestor, so the test has to provide the same thing.
          home: Scaffold(
            body: AiScreen(
              api: AiApi(
                base: 'http://converter.test',
                token: () async => 'id-token',
                client: client,
              ),
            ),
          ),
        ),
      ));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    }

    final configured = answering(jsonEncode({
      'configured': true,
      'sessionTypes': ['UAP', 'UAS'],
      'maxProposals': 40,
    }));

    testWidgets('renders on a phone and a desktop', (tester) async {
      await pump(tester, configured);
      expect(find.text('Ask'), findsWidgets);

      await pump(tester, configured, size: const Size(1440, 900));
    });

    // Better to say so on arrival than to let somebody type a paragraph and
    // find out the server has no key.
    testWidgets('says so when the server has no key', (tester) async {
      await pump(
        tester,
        answering(jsonEncode({
          'configured': false,
          'sessionTypes': ['UAP', 'UAS'],
          'maxProposals': 40,
        })),
      );

      expect(find.text('NOT CONFIGURED'), findsOneWidget);
      expect(find.textContaining('AF_GEMINI_API_KEY'), findsOneWidget);
    });

    testWidgets('says so when the assistant is not there', (tester) async {
      await pump(tester, MockClient((_) async => throw const _Unreachable()));
      expect(find.textContaining('is not reachable'), findsOneWidget);
    });
  });
}

class _Unreachable implements Exception {
  const _Unreachable();
}
