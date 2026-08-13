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

  /// Mono one-liner, in the same voice as the QR Generator's tagline.
  final String tagline;

  /// Prose description on the tile.
  final String description;

  /// The route this tile opens.
  final String route;

  /// False renders the tile as SOON and disables the tap target.
  final bool available;

  const AFProgram({
    required this.id,
    required this.name,
    required this.tagline,
    required this.description,
    required this.route,
    this.available = true,
  });
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
    id: 'qr',
    name: 'QR Generator',
    tagline: 'make anything scannable — offline',
    description:
        'Turn a URL, Wi-Fi string or any text into a QR code. Tune error '
        'correction, quiet zone and colours, drop a logo in the middle, then '
        'export PNG or SVG.',
    route: '/qr',
  ),
];
