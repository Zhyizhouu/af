import 'database_helper.dart';
import '../models/checklist_template_item.dart';

Future<void> seedTemplateIfEmpty() async {
  final db = DatabaseHelper.instance;
  final existing = await db.getTemplate();
  if (existing.isNotEmpty) return; // already seeded

  final items = <Map<String, String>>[
    // Before Assignment / Final Exam Starts
    {
      'section': 'Before Assignment / Final Exam Starts',
      'label': 'Ask Students to wait outside the room',
    },
    {
      'section': 'Before Assignment / Final Exam Starts',
      'label': 'Make sure Total PC Available >= Students Attending Onsite',
    },
    {
      'section': 'Before Assignment / Final Exam Starts',
      'label': '[ONLINE] Form Answer Backup',
    },
    {
      'section': 'Before Assignment / Final Exam Starts',
      'label': '[ONLINE] Start record before opening the question case',
    },
    {
      'section': 'Before Assignment / Final Exam Starts',
      'label': 'Show MANDATORY information (Time XX-XX, Zip Format, etc)',
    },
    {
      'section': 'Before Assignment / Final Exam Starts',
      'label': 'Display Seat (Messier > Job > Assignment Proctor)',
    },

    // Technical
    {'section': 'Technical', 'label': 'Relogin Messier'},
    {'section': 'Technical', 'label': 'Login Zoom and Rename'},
    {'section': 'Technical', 'label': 'Make sure Zoom Recording is Started'},
    {
      'section': 'Technical',
      'label':
          '[OPTIONAL] Turn on TV > HDMI 1 > Duplicate (Screen Settings) > Make sure both TV and Monitor are the same screen',
    },
    {
      'section': 'Technical',
      'label': 'Make sure Speaker and Microphone is Functional',
    },

    // RUMAN
    {'section': 'RUMAN', 'label': 'Clear All Drive'},
    {'section': 'RUMAN', 'label': 'Clear FTP'},
    {'section': 'RUMAN', 'label': 'Open Drive D'},
    {'section': 'RUMAN', 'label': 'Open apps needed (including lab slc)'},
    {'section': 'RUMAN', 'label': 'Lock USB'},
    {'section': 'RUMAN', 'label': 'Clear VSCode Cache'},

    // Students
    {'section': 'Students', 'label': 'Wifi Attendance'},
    {'section': 'Students', 'label': 'All belongings on Podium'},
    {'section': 'Students', 'label': 'Download Question Case'},

    // While Ongoing
    {'section': 'While Ongoing', 'label': 'Remind to keep Saving the files'},
    {
      'section': 'While Ongoing',
      'label': 'Zip before submission (close files before zipping)',
    },
    {'section': 'While Ongoing', 'label': r'Make sure saving at Drive D:\'},

    // Submission
    {'section': 'Submission', 'label': 'Close all apps before Zipping'},
    {'section': 'Submission', 'label': 'Backup Answers to FTP'},
    {'section': 'Submission', 'label': 'Make sure all students submitted'},

    // After Submission
    {'section': 'After Submission', 'label': 'NETFILE [EXTREMELY MANDATORY]'},
    {
      'section': 'After Submission',
      'label': 'Backup to FS-USER [EXTREMELY MANDATORY]',
    },
    {'section': 'After Submission', 'label': 'Attendance Log and Session Log'},
    {'section': 'After Submission', 'label': 'Restart All PC'},
    {'section': 'After Submission', 'label': 'Clear Drive D'},
    {'section': 'After Submission', 'label': 'Clear FTP'},
    {'section': 'After Submission', 'label': 'Open Drive'},
    {'section': 'After Submission', 'label': 'Verify Messier'},
    {'section': 'After Submission', 'label': 'Manual Upload (special cases)'},
  ];

  for (int i = 0; i < items.length; i++) {
    await db.insertTemplateItem(
      ChecklistTemplateItem(
        label: items[i]['label']!,
        section: items[i]['section']!,
        sortOrder: i,
      ),
    );
  }
}
