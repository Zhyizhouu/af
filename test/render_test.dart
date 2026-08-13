import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';

import 'package:af/db/database_helper.dart';
import 'package:af/app/af_shell.dart';
import 'package:af/auth/register_screen.dart';
import 'package:af/auth/sign_in_screen.dart';
import 'package:af/models/calendar_event.dart';
import 'package:af/models/checklist_item.dart';
import 'package:af/models/custom_category.dart';
import 'package:af/models/checklist_template_item.dart';
import 'package:af/models/frequent_course.dart';
import 'package:af/models/proctor_session.dart';
import 'package:af/programs/calendar/calendar_provider.dart';
import 'package:af/programs/calendar/calendar_screen.dart';
import 'package:af/programs/checklist/checklist_detail_screen.dart';
import 'package:af/programs/checklist/checklist_home_screen.dart';
import 'package:af/programs/qr/qr_screen.dart';
import 'package:af/programs/af_program.dart';
import 'package:af/screens/dashboard_screen.dart';
import 'package:af/theme/app_theme.dart';
import 'package:af/widgets/af_glass_icon.dart';

/// Layout smoke tests.
///
/// Every screen is pumped at a phone width and a desktop width, in both
/// themes. The assertion that matters is `takeException()` — a RenderFlex
/// overflow or an unbounded-constraint error fails the test, which is the
/// cheapest way to catch the layout mistakes this design is prone to (long
/// checklist labels, wide mono read-outs, narrow panels).

const Size _phone = Size(390, 844);
const Size _desktop = Size(1280, 900);

late ProctorSession _session;
late String _sessionKey;

void main() {
  setUpAll(() async {
    await _loadFonts();
    await _openBoxes();
  });

  group('dashboard', () {
    testWidgets('renders on a phone', (tester) async {
      await _pump(tester, const DashboardScreen(), size: _phone);
    });

    testWidgets('renders on a desktop', (tester) async {
      await _pump(tester, const DashboardScreen(), size: _desktop);
    });

    testWidgets('renders in dark mode', (tester) async {
      await _pump(
        tester,
        const DashboardScreen(),
        size: _desktop,
        mode: ThemeMode.dark,
      );
    });
  });

  group('checklist', () {
    testWidgets('session list renders on a phone', (tester) async {
      await _pump(tester, const ChecklistHomeScreen(), size: _phone);
      expect(find.text('Today'), findsOneWidget);
    });

    testWidgets('session list renders on a desktop', (tester) async {
      await _pump(tester, const ChecklistHomeScreen(), size: _desktop);
    });

    testWidgets('detail renders long labels without overflowing',
        (tester) async {
      await _pump(
        tester,
        ChecklistDetailScreen(sessionKey: _sessionKey),
        size: _phone,
      );
      expect(find.textContaining('Ruman'), findsWidgets);
    });

    testWidgets('detail renders in dark mode', (tester) async {
      await _pump(
        tester,
        ChecklistDetailScreen(sessionKey: _sessionKey),
        size: _desktop,
        mode: ThemeMode.dark,
      );
    });
  });

  group('calendar', () {
    testWidgets('renders on a phone', (tester) async {
      await _pump(tester, const CalendarScreen(),
          size: _phone, location: '/calendar');
    });

    testWidgets('renders on a desktop', (tester) async {
      await _pump(tester, const CalendarScreen(),
          size: _desktop, location: '/calendar');
    });

    testWidgets('renders in dark mode', (tester) async {
      await _pump(tester, const CalendarScreen(),
          size: _desktop, mode: ThemeMode.dark, location: '/calendar');
    });
  });

  group('calendar views', () {
    for (final view in CalendarView.values) {
      testWidgets('${view.name} renders on a desktop', (tester) async {
        await _pump(
          tester,
          const CalendarScreen(),
          size: _desktop,
          location: '/calendar',
          overrides: [
            calendarViewProvider.overrideWith((ref) => view),
          ],
        );
      });

      testWidgets('${view.name} renders on a phone', (tester) async {
        await _pump(
          tester,
          const CalendarScreen(),
          size: _phone,
          location: '/calendar',
          overrides: [
            calendarViewProvider.overrideWith((ref) => view),
          ],
        );
      });
    }
  });

  group('auth', () {
    testWidgets('sign in renders on a phone', (tester) async {
      await _pump(tester, const SignInScreen(),
          size: _phone, location: '/signin', inShell: false);
      expect(find.textContaining('No account yet'), findsOneWidget);
    });

    testWidgets('sign in renders on a desktop', (tester) async {
      await _pump(tester, const SignInScreen(),
          size: _desktop, location: '/signin', inShell: false);
    });

    testWidgets('register renders long form without overflowing',
        (tester) async {
      await _pump(tester, const RegisterScreen(),
          size: _phone, location: '/register', inShell: false);
      expect(find.textContaining('Already have an account'), findsOneWidget);
    });

    testWidgets('register renders in dark mode', (tester) async {
      await _pump(tester, const RegisterScreen(),
          size: _desktop, mode: ThemeMode.dark,
          location: '/register', inShell: false);
    });

    // Firebase is absent in tests, so nobody is signed in and every program
    // tile must fall back to its locked state rather than erroring.
    testWidgets('dashboard locks programs when signed out', (tester) async {
      await _pump(tester, const DashboardScreen(), size: _desktop);
      expect(find.text('SIGN IN →'), findsWidgets);
      expect(find.textContaining('account required'), findsWidgets);
    });
  });

  // The marks are pure paint with no data behind them, so the useful check is
  // that every glyph survives both extremes of the scale it has to serve: the
  // board's 212px tile and a favicon.
  group('glass icons', () {
    Widget board(double size) => Center(
          child: Wrap(
            spacing: 24,
            runSpacing: 24,
            children: [
              for (final glyph in AFGlassGlyph.values)
                AFGlassIcon(glyph: glyph, size: size),
            ],
          ),
        );

    testWidgets('every mark paints at tile size', (tester) async {
      await _pump(tester, board(212), size: _desktop, inShell: false);
      expect(find.byType(AFGlassIcon), findsNWidgets(4));
    });

    testWidgets('every mark paints at favicon size', (tester) async {
      await _pump(tester, board(32), size: _phone, inShell: false);
      expect(find.byType(AFGlassIcon), findsNWidgets(4));
    });

    testWidgets('the dashboard carries one mark per program', (tester) async {
      await _pump(tester, const DashboardScreen(), size: _desktop);
      expect(find.byType(AFGlassIcon), findsNWidgets(afPrograms.length));
    });
  });

  group('qr generator', () {
    testWidgets('renders empty on a phone', (tester) async {
      await _pump(tester, const QrScreen(), size: _phone);
      expect(find.textContaining('Type something'), findsOneWidget);
    });

    testWidgets('renders empty on a desktop', (tester) async {
      await _pump(tester, const QrScreen(), size: _desktop);
    });

    testWidgets('renders a real code after input', (tester) async {
      await _pump(tester, const QrScreen(), size: _desktop);

      await tester.enterText(
        find.byType(TextField).first,
        'https://binus.ac.id/exam',
      );
      await tester.pump(const Duration(milliseconds: 200));
      await tester.pumpAndSettle();

      // The read-out only shows dimensions once a matrix exists.
      expect(find.textContaining('px'), findsWidgets);
      expect(find.textContaining('binus-ac-id-exam'), findsOneWidget);
    });

    testWidgets('renders in dark mode', (tester) async {
      await _pump(
        tester,
        const QrScreen(),
        size: _desktop,
        mode: ThemeMode.dark,
      );
    });
  });
}

Future<void> _pump(
  WidgetTester tester,
  Widget screen, {
  required Size size,
  ThemeMode mode = ThemeMode.light,
  String location = '/dashboard',
  bool inShell = true,
  List<Override> overrides = const [],
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: overrides,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light,
        darkTheme: AppTheme.dark,
        themeMode: mode,
        home: inShell
            ? AFShell(location: location, child: screen)
            : screen,
      ),
    ),
  );
  await tester.pumpAndSettle();

  expect(tester.takeException(), isNull);
}

/// The test environment ships no fonts, so text would otherwise be laid out
/// with a fallback metric and hide real overflow. Borrow the system's.
Future<void> _loadFonts() async {
  Future<void> load(String family, String path) async {
    final file = File(path);
    if (!file.existsSync()) return;
    final bytes = await file.readAsBytes();
    final loader = FontLoader(family)
      ..addFont(Future.value(ByteData.view(bytes.buffer)));
    await loader.load();
  }

  await load('Roboto', r'C:\Windows\Fonts\segoeui.ttf');
  await load('Menlo', r'C:\Windows\Fonts\consola.ttf');
}

/// Wires [DatabaseHelper] to temporary boxes without going through
/// `initFlutter`, which needs path_provider and a platform channel.
Future<void> _openBoxes() async {
  final directory = Directory.systemTemp.createTempSync('af_render_test');
  Hive.init(directory.path);

  Hive.registerAdapter(ProctorSessionAdapter());
  Hive.registerAdapter(ChecklistItemAdapter());
  Hive.registerAdapter(ChecklistTemplateItemAdapter());
  Hive.registerAdapter(FrequentCourseAdapter());
  Hive.registerAdapter(CalendarEventAdapter());
  Hive.registerAdapter(CustomCategoryAdapter());

  final db = DatabaseHelper.instance;
  db.sessionsBox = await Hive.openBox<ProctorSession>('proctor_sessions');
  db.checklistItemsBox = await Hive.openBox<ChecklistItem>('checklist_items');
  db.templateBox =
      await Hive.openBox<ChecklistTemplateItem>('checklist_template');
  db.frequentCoursesBox =
      await Hive.openBox<FrequentCourse>('frequent_courses');
  db.settingsBox = await Hive.openBox('af_settings');
  db.calendarEventsBox =
      await Hive.openBox<CalendarEvent>('calendar_events');
  db.customCategoriesBox =
      await Hive.openBox<CustomCategory>('event_categories');

  _session = ProctorSession(
    type: 'UAS',
    dateTime: DateTime.now().add(const Duration(hours: 2)),
    room: '724',
    courseCode: 'COSC6092001',
    courseName: 'Code Reengineering',
    courseClass: 'BB01',
    createdAt: DateTime.now(),
  );
  final key = await db.insertSession(_session);
  _sessionKey = key;

  // Deliberately includes one of the longest real template labels so the
  // detail screen is exercised against text that has to wrap, and one fully
  // checked section so the accented-panel path is painted.
  const items = <({String section, String label, bool checked})>[
    (
      section: 'Fase 2 — Ruman & Setup PC (H-25 menit)',
      label: 'Ruman: Restart PC',
      checked: true,
    ),
    (
      section: 'Fase 2 — Ruman & Setup PC (H-25 menit)',
      label: 'Ruman: Clear VSCode Cache',
      checked: false,
    ),
    (
      section: 'Fase 6 — Selama Ujian Berlangsung',
      label: 'Ujian >180 menit & ke toilet → harus didampingi pengawas, '
          'pastikan tidak bawa contekan',
      checked: false,
    ),
    (
      section: 'Fase 9 — Selesai Mengawas',
      label: 'Clear Drive D',
      checked: true,
    ),
  ];

  for (var i = 0; i < items.length; i++) {
    await db.insertChecklistItem(
      ChecklistItem(
        sessionKey: key,
        label: items[i].label,
        section: items[i].section,
        isChecked: items[i].checked,
        sortOrder: i,
      ),
    );
  }
}
