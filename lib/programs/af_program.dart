/// One program inside AF.
///
/// AF is a shell; each program is a self-contained tool that owns its own
/// screens but shares the design system and the local database. Adding a
/// program means writing its screens, adding a route in `app/router.dart`, and
/// appending one entry here — the dashboard and nav bar pick it up from there.
class AFProgram {
  /// Stable key, used for dashboard status lookups and settings.
  final String id;

  /// Shown as the tile's panel label, uppercased.
  final String name;

  /// Shorter label for the nav bar, where five full names crowd the row.
  /// Defaults to [name].
  final String? shortName;

  /// Mono one-liner, in the same voice as the QR Generator's tagline.
  final String tagline;

  /// Prose description on the tile.
  final String description;

  /// The route this tile opens.
  final String route;

  /// False renders the tile as SOON and disables the tap target.
  final bool available;

  /// Whether the program needs an account.
  ///
  /// Locked programs still appear on the dashboard — a signed-out visitor
  /// should be able to see what AF holds — but the tile routes to sign-in
  /// instead of opening.
  final bool requiresAuth;

  const AFProgram({
    required this.id,
    required this.name,
    this.shortName,
    required this.tagline,
    required this.description,
    required this.route,
    this.available = true,
    this.requiresAuth = true,
  });

  String get navLabel => shortName ?? name;
}

const List<AFProgram> afPrograms = [
  AFProgram(
    id: 'checklists',
    name: 'Checklists',
    tagline: 'proctor sessions, start to finish',
    description:
        'Track UAP and UAS proctoring against the standard template. Sessions '
        'archive themselves once every item is ticked.',
    route: '/checklists',
  ),
  AFProgram(
    id: 'calendar',
    name: 'Calendar',
    tagline: 'everything on one grid',
    description:
        'Your own events on a month grid, with proctor sessions from '
        'Checklists overlaid so nothing collides.',
    route: '/calendar',
  ),
  AFProgram(
    id: 'habits',
    name: 'Habits',
    tagline: 'one tick a day',
    description:
        'Track daily habits against a checklist and watch the completion '
        'trend. Days start at midnight Jakarta time, wherever you are.',
    route: '/habits',
  ),
  AFProgram(
    id: 'audio',
    name: 'Audio Converter',
    shortName: 'Audio',
    tagline: 'anything in, any format out',
    description:
        'Upload audio or video and get it back as MP3, WAV, FLAC, M4A, OGG or '
        'Opus. The conversion runs on a worker rather than in the browser, so '
        'the tab is free while it works.',
    route: '/audio',
  ),
  AFProgram(
    id: 'captions',
    name: 'Captions',
    tagline: 'transcribe, retime, write back in',
    description:
        'Transcribe a video, correct the timings on a timeline, then write the '
        'captions back into it as a track. Downloads as a captioned MP4 or as '
        'an SRT to drop on an editing timeline.',
    route: '/captions',
  ),
  AFProgram(
    id: 'qr',
    name: 'QR Generator',
    shortName: 'QR',
    tagline: 'make anything scannable — offline',
    description:
        'Turn a URL, Wi-Fi string or any text into a QR code. Tune error '
        'correction, quiet zone and colours, drop a logo in the middle, then '
        'export PNG or SVG.',
    route: '/qr',
  ),
];
