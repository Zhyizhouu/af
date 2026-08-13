import 'package:flutter/widgets.dart';

import 'checklist/checklist_home_screen.dart';
import 'qr/qr_screen.dart';

/// One program inside AF.
///
/// AF is a shell; each program is a self-contained tool that owns its own
/// screens but shares the design system and the local database. Adding a
/// program means writing its screens and appending one entry to [afPrograms] —
/// the dashboard picks it up from there.
class AFProgram {
  /// Stable key. Used for dashboard status lookups and settings.
  final String id;

  /// Shown as the tile's panel label, uppercased.
  final String name;

  /// Mono one-liner, in the same voice as the QR Generator's tagline.
  final String tagline;

  /// Prose description on the tile.
  final String description;

  /// False renders the tile as SOON and disables the tap target.
  final bool available;

  final WidgetBuilder builder;

  const AFProgram({
    required this.id,
    required this.name,
    required this.tagline,
    required this.description,
    required this.builder,
    this.available = true,
  });
}

Widget _buildChecklists(BuildContext context) => const ChecklistHomeScreen();

Widget _buildQrGenerator(BuildContext context) => const QrScreen();

const List<AFProgram> afPrograms = [
  AFProgram(
    id: 'checklists',
    name: 'Checklists',
    tagline: 'proctor sessions, start to finish',
    description:
        'Track UAP and UAS proctoring against the standard template. Sessions '
        'archive themselves once every item is ticked.',
    builder: _buildChecklists,
  ),
  AFProgram(
    id: 'qr',
    name: 'QR Generator',
    tagline: 'make anything scannable — offline',
    description:
        'Turn a URL, Wi-Fi string or any text into a QR code. Tune error '
        'correction, quiet zone and colours, drop a logo in the middle, then '
        'export PNG or SVG.',
    builder: _buildQrGenerator,
  ),
];
