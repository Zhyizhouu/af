import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:af/programs/ai/ai_api.dart';
import 'package:af/programs/ai/ai_proposal_card.dart';
import 'package:af/programs/ai/ai_screen.dart';
import 'package:af/programs/calendar/calendar_provider.dart';
import 'package:af/programs/calendar/category_provider.dart';
import 'package:af/programs/calendar/event_category.dart';
import 'package:af/theme/app_theme.dart';

/// The assistant's client half.
///
/// The model runs on the server and is not testable from here. What is
/// testable is everything protecting the calendar from it: that a malformed
/// proposal is dropped rather than shown, that a missing field is visible
/// rather than blank, and that nothing is written until the button is pressed.
///
/// The conversation is testable here too, and matters more than it looks:
/// the transcript lives in this app, so what the assistant knows on its second
/// turn is entirely a question of what this code chose to send back.
void main() {
  const jsonHeaders = {'content-type': 'application/json'};

  String answerBody({
    List<Map<String, Object>> sessions = const [],
    List<Map<String, Object>> events = const [],
    List<String> removals = const [],
    String reply = 'Here you go.',
  }) =>
      jsonEncode({
        'sessions': sessions,
        'events': events,
        'removals': removals,
        'reply': reply,
      });

  final limitsBody = jsonEncode({
    'configured': true,
    'sessionTypes': ['UAP', 'UAS'],
    'maxProposals': 40,
  });

  MockClient answering(String body, [int status = 200]) =>
      MockClient((_) async => http.Response(body, status, headers: jsonHeaders));

  Map<String, Object> event({
    String title = 'Lunch with Dina',
    String start = '2026-08-19 12:00',
    String end = '2026-08-19 13:00',
    String category = 'social',
  }) =>
      {
        'title': title,
        'notes': '',
        'start': start,
        'end': end,
        'allDay': false,
        'category': category,
      };

  group('api', () {
    test('reads sessions, events and the reply out of an answer', () async {
      final api = AiApi(
        base: 'http://converter.test',
        token: () async => 'id-token',
        client: answering(answerBody(
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
          events: [event()],
          reply: 'I assumed 2026.',
        )),
      );

      final answer = await api.send(
        message: 'anything',
        history: const [],
        existing: const [],
        now: DateTime(2026, 8, 15, 9),
        categories: const ['social', 'other'],
      );

      expect(answer.sessions, hasLength(1));
      expect(answer.sessions.single.type, 'UAP');
      expect(answer.sessions.single.start, DateTime(2026, 8, 17, 9));
      expect(
          answer.sessions.single.label, 'COMP6047 · Algorithm and Programming');
      expect(answer.events.single.title, 'Lunch with Dina');
      expect(answer.reply, 'I assumed 2026.');
      expect(answer.total, 2);
    });

    // The server keeps nothing between calls, so a correction like "make that
    // 10am" is answerable only if this app sends back what was said before.
    test('sends the conversation so far with each message', () async {
      Map<String, dynamic>? sent;
      final api = AiApi(
        base: 'http://converter.test',
        token: () async => 'id-token',
        client: MockClient((request) async {
          sent = jsonDecode(request.body) as Map<String, dynamic>;
          return http.Response(answerBody(), 200, headers: jsonHeaders);
        }),
      );

      await api.send(
        message: 'make that 10am',
        history: [
          const AiTurn(role: AiTurn.roleUser, text: 'lunch on Wednesday'),
          AiTurn(
            role: AiTurn.roleAssistant,
            text: 'Booked for noon.',
            events: [
              EventProposal(
                title: 'Lunch',
                notes: '',
                start: DateTime(2026, 8, 19, 12),
                end: DateTime(2026, 8, 19, 13),
                allDay: false,
                category: 'social',
              ),
            ],
            committed: true,
          ),
        ],
        existing: [
          AiEntry(
            id: 'evt-1',
            kind: AiEntry.kindEvent,
            title: 'Dentist',
            start: DateTime(2026, 8, 20, 8),
            end: DateTime(2026, 8, 20, 9),
            allDay: false,
            category: 'health',
          ),
        ],
        now: DateTime(2026, 8, 15, 9),
        categories: const ['social'],
      );

      // Without this the assistant cannot see anything it did not itself
      // propose, and "cancel the dentist" reads to it as a dentist that does
      // not exist.
      final existing = sent!['existing'] as List;
      expect(existing, hasLength(1));
      expect(existing[0]['id'], 'evt-1');
      expect(existing[0]['kind'], 'event');
      expect(existing[0]['start'], '2026-08-20 08:00');

      final history = sent!['history'] as List;
      expect(history, hasLength(2));
      expect(history[0]['role'], 'user');
      expect(history[1]['role'], 'assistant');
      expect(history[1]['text'], 'Booked for noon.');
      // The entries have to travel with the turn, not just the prose — the
      // prose alone does not say which entry "that" refers to.
      expect(history[1]['events'], hasLength(1));
      expect(history[1]['events'][0]['start'], '2026-08-19 12:00');
      expect(history[1]['committed'], isTrue);
      expect(sent!['prompt'], 'make that 10am');
    });

    // The server normalises too, but a proposal that arrives unreadable must
    // never reach the review list — an entry nobody can check is worse than a
    // missing one.
    test('a proposal with an unreadable time is dropped, not shown', () async {
      final api = AiApi(
        base: 'http://converter.test',
        token: () async => 'id-token',
        client: answering(answerBody(events: [
          event(title: 'Broken', start: 'next tuesday', category: 'work'),
          event(title: 'Fine', category: 'work'),
        ])),
      );

      final answer = await api.send(
        message: 'anything',
        history: const [],
        existing: const [],
        now: DateTime(2026, 8, 15, 9),
        categories: const ['work'],
      );

      expect(answer.events, hasLength(1));
      expect(answer.events.single.title, 'Fine');
    });

    test('an end at or before its start becomes an hour', () async {
      final api = AiApi(
        base: 'http://converter.test',
        token: () async => 'id-token',
        client: answering(answerBody(events: [
          event(
            title: 'Backwards',
            start: '2026-08-19 12:00',
            end: '2026-08-19 09:00',
            category: 'work',
          ),
        ])),
      );

      final answer = await api.send(
        message: 'anything',
        history: const [],
        existing: const [],
        now: DateTime(2026, 8, 15, 9),
        categories: const ['work'],
      );

      expect(answer.events.single.end, DateTime(2026, 8, 19, 13));
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
        api.send(
          message: 'x',
          history: const [],
          existing: const [],
          now: DateTime(2026, 8, 15),
          categories: const ['work'],
        ),
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
        api.send(
          message: 'x',
          history: const [],
          existing: const [],
          now: DateTime(2026, 8, 15),
          categories: const ['work'],
        ),
        throwsA(isA<AiError>().having(
          (e) => e.message,
          'message',
          'Sign in to use the assistant.',
        )),
      );
    });

    // The endpoint is account-scoped on the server, so a request without a
    // token is one the server is about to refuse anyway.
    test('even reading the limits is signed', () async {
      String? authorization;
      final api = AiApi(
        base: 'http://converter.test',
        token: () async => 'id-token',
        client: MockClient((request) async {
          authorization = request.headers['Authorization'];
          return http.Response(limitsBody, 200, headers: jsonHeaders);
        }),
      );

      await api.limits();
      expect(authorization, 'Bearer id-token');
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
    /// Something already in the calendar, as the merged agenda sees it.
    AgendaEntry scheduled({
      String id = 'evt-1',
      String title = 'Lunch with Dina',
      AgendaKind kind = AgendaKind.event,
      DateTime? start,
    }) {
      final at = start ?? DateTime.now().add(const Duration(days: 1));
      return AgendaEntry(
        kind: kind,
        id: id,
        title: title,
        subtitle: '',
        start: at,
        end: at.add(const Duration(hours: 1)),
        allDay: false,
        category: kind == AgendaKind.event ? fallbackCategory : null,
      );
    }

    Future<void> pump(
      WidgetTester tester,
      MockClient client, {
      Size size = const Size(390, 844),
      List<AgendaEntry> agenda = const [],
    }) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(ProviderScope(
        overrides: [
          categoriesProvider.overrideWith((ref) async => builtInCategories),
          agendaProvider.overrideWith((ref) async => agenda),
        ],
        child: MaterialApp(
          theme: AppTheme.light,
          // AFShell owns the Scaffold in the real app; the composer needs a
          // Material ancestor, so the test has to provide the same thing.
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

    /// A client that answers /v1/ai/limits normally and hands out [answers] in
    /// order for everything else, recording what it was asked.
    MockClient scripted(List<Map<String, dynamic>> captured, List<String> answers) {
      var sent = 0;
      return MockClient((request) async {
        if (request.url.path.endsWith('/limits')) {
          return http.Response(limitsBody, 200, headers: jsonHeaders);
        }
        captured.add(jsonDecode(request.body) as Map<String, dynamic>);
        final body = answers[sent < answers.length ? sent : answers.length - 1];
        sent++;
        return http.Response(body, 200, headers: jsonHeaders);
      });
    }

    Future<void> say(WidgetTester tester, String message) async {
      await tester.enterText(find.byType(TextField), message);
      await tester.tap(find.text('Send'));
      await tester.pumpAndSettle();
    }

    testWidgets('renders on a phone and a desktop', (tester) async {
      await pump(tester, scripted([], [answerBody()]));
      expect(find.text('Send'), findsOneWidget);

      await pump(tester, scripted([], [answerBody()]),
          size: const Size(1440, 900));
    });

    testWidgets('a message and its answer both stay on screen', (tester) async {
      await pump(
        tester,
        scripted([], [
          answerBody(events: [event()], reply: 'Lunch it is.'),
        ]),
      );

      await say(tester, 'lunch with Dina on Wednesday');

      expect(find.text('lunch with Dina on Wednesday'), findsOneWidget);
      expect(find.text('Lunch it is.'), findsOneWidget);
      expect(find.text('Lunch with Dina'), findsOneWidget);
      expect(find.text('Add 1 to my calendar'), findsOneWidget);
    });

    // The point of the conversation: the second message is answered knowing
    // what the first one produced.
    testWidgets('the second message carries the first exchange', (tester) async {
      final captured = <Map<String, dynamic>>[];
      await pump(
        tester,
        scripted(captured, [
          answerBody(events: [event()], reply: 'Booked for noon.'),
          answerBody(events: [event(start: '2026-08-19 10:00')], reply: 'Moved.'),
        ]),
      );

      await say(tester, 'lunch with Dina on Wednesday');
      await say(tester, 'make that 10am');

      expect(captured, hasLength(2));
      expect(captured[0]['history'], isEmpty);

      final history = captured[1]['history'] as List;
      expect(history, hasLength(2));
      expect(history[0]['text'], 'lunch with Dina on Wednesday');
      expect(history[1]['text'], 'Booked for noon.');
      expect(history[1]['events'], hasLength(1));
    });

    // A removed proposal is off the table, and the assistant restates whatever
    // is still standing — so sending it back would have it re-propose the one
    // thing that was just thrown out.
    testWidgets('a removed proposal is not sent back', (tester) async {
      final captured = <Map<String, dynamic>>[];
      await pump(
        tester,
        scripted(captured, [
          answerBody(events: [
            event(title: 'Lunch with Dina'),
            event(title: 'Dentist', start: '2026-08-20 08:00'),
          ]),
          answerBody(reply: 'Right.'),
        ]),
      );

      await say(tester, 'two things please');
      expect(find.text('Add 2 to my calendar'), findsOneWidget);

      // Each card carries its own Remove; the dentist is the second.
      await tester.tap(find.text('Remove').last);
      await tester.pumpAndSettle();
      expect(find.text('Dentist'), findsNothing);
      expect(find.text('Add 1 to my calendar'), findsOneWidget);

      await say(tester, 'anything else?');

      final history = captured[1]['history'] as List;
      final events = history[1]['events'] as List;
      expect(events, hasLength(1));
      expect(events.single['title'], 'Lunch with Dina');
    });

    testWidgets('a failure is shown in the transcript, not as a dead end',
        (tester) async {
      await pump(
        tester,
        MockClient((request) async {
          if (request.url.path.endsWith('/limits')) {
            return http.Response(limitsBody, 200, headers: jsonHeaders);
          }
          return http.Response(
            jsonEncode({'error': 'The assistant could not answer. Try again.'}),
            502,
            headers: jsonHeaders,
          );
        }),
      );

      await say(tester, 'lunch on Wednesday');

      expect(find.text('The assistant could not answer. Try again.'),
          findsOneWidget);
      // The conversation is still usable — the composer did not lock up.
      expect(find.text('Send'), findsOneWidget);
    });

    testWidgets('a new chat clears the transcript', (tester) async {
      await pump(tester, scripted([], [answerBody(reply: 'Noted.')]));

      await say(tester, 'hello');
      expect(find.text('hello'), findsOneWidget);

      await tester.tap(find.byTooltip('New chat'));
      await tester.pumpAndSettle();

      expect(find.text('hello'), findsNothing);
      expect(find.text('Noted.'), findsNothing);
    });

    // The assistant is blind to anything it did not itself propose unless this
    // app tells it what is there — which is why "cancel the lunch tomorrow"
    // used to come back as "you have nothing scheduled tomorrow".
    testWidgets('what is already scheduled goes out with the message',
        (tester) async {
      final captured = <Map<String, dynamic>>[];
      await pump(
        tester,
        scripted(captured, [answerBody(reply: 'Noted.')]),
        agenda: [scheduled(title: 'Lunch with Dina')],
      );

      await say(tester, 'what do I have tomorrow?');

      final existing = captured.single['existing'] as List;
      expect(existing, hasLength(1));
      expect(existing.single['id'], 'evt-1');
      expect(existing.single['title'], 'Lunch with Dina');
      expect(existing.single['kind'], 'event');
    });

    // Entries far outside the window would crowd out the ones a request is
    // actually about, and cost tokens for the privilege.
    testWidgets('only the near calendar is sent', (tester) async {
      final captured = <Map<String, dynamic>>[];
      await pump(
        tester,
        scripted(captured, [answerBody(reply: 'Noted.')]),
        agenda: [
          scheduled(id: 'near', title: 'Near'),
          scheduled(
            id: 'far',
            title: 'Far',
            start: DateTime.now().add(const Duration(days: 400)),
          ),
          scheduled(
            id: 'old',
            title: 'Old',
            start: DateTime.now().subtract(const Duration(days: 400)),
          ),
        ],
      );

      await say(tester, 'anything');

      final existing = captured.single['existing'] as List;
      expect(existing, hasLength(1));
      expect(existing.single['title'], 'Near');
    });

    // The answer carries an id and nothing else, so the card has to be drawn
    // from this app's own record. Anything else could describe one entry while
    // deleting another.
    testWidgets('a deletion is shown as the entry it will really delete',
        (tester) async {
      await pump(
        tester,
        scripted([], [
          answerBody(removals: ['evt-1'], reply: 'I will cancel that lunch.'),
        ]),
        agenda: [scheduled(title: 'Lunch with Dina')],
      );

      await say(tester, 'cancel the lunch tomorrow');

      expect(find.text('DELETE'), findsOneWidget);
      expect(find.text('Lunch with Dina'), findsOneWidget);
      expect(find.textContaining('Confirming deletes it'), findsOneWidget);
      // Named, not counted: a button that destroys something should say so.
      expect(find.text('Delete 1 entry'), findsOneWidget);
      // And the way out of a deletion card is to keep the entry.
      expect(find.text('Keep it'), findsOneWidget);
    });

    // A model that names an entry nobody sent it is hallucinating, and the
    // client must not invent a card for it either.
    testWidgets('a deletion naming nothing real is not shown', (tester) async {
      await pump(
        tester,
        scripted([], [
          answerBody(removals: ['made-up'], reply: 'Cancelling that.'),
        ]),
        agenda: [scheduled(title: 'Lunch with Dina')],
      );

      await say(tester, 'cancel something');

      expect(find.text('Cancelling that.'), findsOneWidget);
      expect(find.text('DELETE'), findsNothing);
      expect(find.textContaining('Delete'), findsNothing);
    });

    // A move is a delete plus a create, and the create is the half that gets
    // lost — leaving a button that only destroys something.
    testWidgets('a move shows both halves under one button', (tester) async {
      await pump(
        tester,
        scripted([], [
          jsonEncode({
            'sessions': [
              {
                'type': 'UAS',
                'start': '2026-08-18 10:00',
                'room': '401',
                'courseCode': 'COMP6047',
                'courseName': 'Algorithm',
                'courseClass': 'BAA1',
              }
            ],
            'events': [],
            'removals': ['sess-1'],
            'reply': 'Moved it to 10.',
          }),
        ]),
        agenda: [
          scheduled(
            id: 'sess-1',
            title: 'UAS · Room 401',
            kind: AgendaKind.session,
          ),
        ],
      );

      await say(tester, 'move my UAS to 10am');

      expect(find.text('DELETE'), findsOneWidget);
      expect(find.text('SESSION'), findsWidgets);
      expect(find.text('Add 1 and delete 1'), findsOneWidget);
    });

    testWidgets('keeping an entry drops it from the deletion', (tester) async {
      final captured = <Map<String, dynamic>>[];
      await pump(
        tester,
        scripted(captured, [
          answerBody(removals: ['evt-1'], reply: 'I will cancel that.'),
          answerBody(reply: 'Right.'),
        ]),
        agenda: [scheduled(title: 'Lunch with Dina')],
      );

      await say(tester, 'cancel the lunch');
      expect(find.text('DELETE'), findsOneWidget);

      await tester.tap(find.text('Keep it'));
      await tester.pumpAndSettle();
      expect(find.text('DELETE'), findsNothing);

      await say(tester, 'anything else?');

      // Sending it back would have the assistant offer the deletion again.
      final history = captured[1]['history'] as List;
      expect(history[1]['removals'], anyOf(isNull, isEmpty));
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
