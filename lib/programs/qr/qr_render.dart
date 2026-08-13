import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:qr/qr.dart';

/// Encoding, painting and export for the QR program.
///
/// This is a direct port of the drawing logic in `AF-QRgenerator.html` — same
/// quiet-zone handling, same integer cell sizing so modules land on whole
/// pixels, and the same aspect-preserving logo knockout.

/// The outcome of encoding some text. Exactly one of [image] / [error] is set.
class QrEncodeResult {
  final QrImage? image;
  final String? error;

  const QrEncodeResult._(this.image, this.error);

  const QrEncodeResult.success(QrImage image) : this._(image, null);

  const QrEncodeResult.failure(String error) : this._(null, error);

  bool get ok => image != null;
}

/// Encodes [data] at [errorCorrectLevel] (a `QrErrorCorrectLevel` constant).
///
/// The `qr` package builds its data lazily, so an over-long input does not
/// throw until [QrImage] walks the buffer — both calls stay inside the try.
QrEncodeResult encodeQr(String data, int errorCorrectLevel) {
  try {
    final code = QrCode.fromData(
      data: data,
      errorCorrectLevel: errorCorrectLevel,
    );
    return QrEncodeResult.success(QrImage(code));
  } on InputTooLongException {
    return const QrEncodeResult.failure(
      'Too much data for one QR. Shorten the text or lower the '
      'error-correction level.',
    );
  } catch (_) {
    return const QrEncodeResult.failure('Could not encode that input.');
  }
}

/// The pixel size an export will actually be.
///
/// Cells are whole pixels, so the real output is the largest multiple of the
/// module grid that fits inside [targetSize] — matching the HTML's
/// `cell = floor(size / total)`.
({int cell, int dimension}) qrExportGeometry({
  required int moduleCount,
  required int quietZone,
  required int targetSize,
}) {
  final total = moduleCount + quietZone * 2;
  final cell = math.max(1, targetSize ~/ total);
  return (cell: cell, dimension: cell * total);
}

/// Fits a logo inside a square [side] without distorting it.
({double width, double height}) _logoBox(int imgW, int imgH, double side) {
  if (imgW >= imgH) return (width: side, height: side * imgH / imgW);
  return (width: side * imgW / imgH, height: side);
}

/// Draws the code onto [canvas] with the origin at (0, 0).
void paintQr(
  Canvas canvas, {
  required QrImage image,
  required int quietZone,
  required double cell,
  required Color foreground,
  required Color background,
  ui.Image? logo,
  double logoScale = 0.16,
}) {
  final count = image.moduleCount;
  final total = count + quietZone * 2;
  final dim = cell * total;

  canvas.drawRect(
    Rect.fromLTWH(0, 0, dim, dim),
    Paint()..color = background,
  );

  // Antialiasing off: module edges must stay hard or scanners lose contrast.
  final modulePaint = Paint()
    ..color = foreground
    ..isAntiAlias = false;

  for (var row = 0; row < count; row++) {
    for (var col = 0; col < count; col++) {
      if (!image.isDark(row, col)) continue;
      canvas.drawRect(
        Rect.fromLTWH(
          (col + quietZone) * cell,
          (row + quietZone) * cell,
          cell,
          cell,
        ),
        modulePaint,
      );
    }
  }

  if (logo == null) return;

  final codeSize = count * cell;
  final box = logoScale * codeSize;
  final fitted = _logoBox(logo.width, logo.height, box);
  final pad = box * 0.14;
  final plateW = fitted.width + pad * 2;
  final plateH = fitted.height + pad * 2;
  final centre = Offset(dim / 2, dim / 2);

  // Knock a background-coloured plate out of the modules first, so the logo
  // never sits directly on data.
  final plate = RRect.fromRectAndRadius(
    Rect.fromCenter(center: centre, width: plateW, height: plateH),
    Radius.circular(math.min(plateW, plateH) * 0.16),
  );
  canvas.drawRRect(plate, Paint()..color = background);

  canvas.drawImageRect(
    logo,
    Rect.fromLTWH(0, 0, logo.width.toDouble(), logo.height.toDouble()),
    Rect.fromCenter(
      center: centre,
      width: fitted.width,
      height: fitted.height,
    ),
    Paint()..filterQuality = FilterQuality.high,
  );
}

/// Rasterises the code at a whole-pixel cell size.
///
/// [targetSize] is the requested edge length; the returned image is the
/// nearest size down that keeps cells square and integral.
Future<ui.Image> rasterizeQr({
  required QrImage image,
  required int quietZone,
  required int targetSize,
  required Color foreground,
  required Color background,
  ui.Image? logo,
  double logoScale = 0.16,
}) async {
  final geometry = qrExportGeometry(
    moduleCount: image.moduleCount,
    quietZone: quietZone,
    targetSize: targetSize,
  );

  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder);
  paintQr(
    canvas,
    image: image,
    quietZone: quietZone,
    cell: geometry.cell.toDouble(),
    foreground: foreground,
    background: background,
    logo: logo,
    logoScale: logoScale,
  );
  final picture = recorder.endRecording();
  try {
    return await picture.toImage(geometry.dimension, geometry.dimension);
  } finally {
    picture.dispose();
  }
}

Future<Uint8List> encodePng(ui.Image image) async {
  final data = await image.toByteData(format: ui.ImageByteFormat.png);
  if (data == null) {
    throw StateError('Could not encode the QR code as PNG.');
  }
  return data.buffer.asUint8List();
}

/// Builds a vector copy of the code.
///
/// One `<path>` holds every dark module, which keeps the file small even for
/// dense codes. [logoDataUri] should be a complete `data:` URI.
String buildQrSvg({
  required QrImage image,
  required int quietZone,
  required int size,
  required Color foreground,
  required Color background,
  String? logoDataUri,
  int? logoWidth,
  int? logoHeight,
  double logoScale = 0.16,
}) {
  final count = image.moduleCount;
  final total = count + quietZone * 2;

  final path = StringBuffer();
  for (var row = 0; row < count; row++) {
    for (var col = 0; col < count; col++) {
      if (image.isDark(row, col)) {
        path.write('M${col + quietZone} ${row + quietZone}h1v1h-1z');
      }
    }
  }

  final svg = StringBuffer()
    ..write(
      '<svg xmlns="http://www.w3.org/2000/svg" width="$size" height="$size" '
      'viewBox="0 0 $total $total" shape-rendering="crispEdges">',
    )
    ..write(
      '<rect width="$total" height="$total" fill="${toHex(background)}"/>',
    )
    ..write('<path d="$path" fill="${toHex(foreground)}"/>');

  if (logoDataUri != null && logoWidth != null && logoHeight != null) {
    final box = logoScale * count;
    final fitted = _logoBox(logoWidth, logoHeight, box);
    final pad = box * 0.14;
    final plateW = fitted.width + pad * 2;
    final plateH = fitted.height + pad * 2;
    final centre = total / 2;
    final radius = math.min(plateW, plateH) * 0.16;

    svg
      ..write(
        '<rect x="${centre - plateW / 2}" y="${centre - plateH / 2}" '
        'width="$plateW" height="$plateH" rx="$radius" '
        'fill="${toHex(background)}"/>',
      )
      ..write(
        '<image x="${centre - fitted.width / 2}" '
        'y="${centre - fitted.height / 2}" '
        'width="${fitted.width}" height="${fitted.height}" '
        'href="$logoDataUri" preserveAspectRatio="xMidYMid meet"/>',
      );
  }

  svg.write('</svg>');
  return svg.toString();
}

// ---- colour helpers ----

/// `#RRGGBB`, uppercase. Alpha is dropped — QR codes are always opaque.
String toHex(Color color) {
  final rgb = color.toARGB32() & 0xFFFFFF;
  return '#${rgb.toRadixString(16).padLeft(6, '0').toUpperCase()}';
}

/// Parses `#RGB`, `#RRGGBB` or the same without the hash. Null if malformed.
Color? parseHex(String value) {
  var text = value.trim();
  if (text.startsWith('#')) text = text.substring(1);

  if (text.length == 3 && RegExp(r'^[0-9a-fA-F]{3}$').hasMatch(text)) {
    text = text.split('').map((c) => '$c$c').join();
  }
  if (!RegExp(r'^[0-9a-fA-F]{6}$').hasMatch(text)) return null;

  return Color(0xFF000000 | int.parse(text, radix: 16));
}

/// WCAG relative luminance.
double relativeLuminance(Color color) {
  double channel(double c) =>
      c <= 0.03928 ? c / 12.92 : math.pow((c + 0.055) / 1.055, 2.4).toDouble();

  final argb = color.toARGB32();
  final r = channel(((argb >> 16) & 0xFF) / 255);
  final g = channel(((argb >> 8) & 0xFF) / 255);
  final b = channel((argb & 0xFF) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

double contrastRatio(Color a, Color b) {
  final la = relativeLuminance(a);
  final lb = relativeLuminance(b);
  return (math.max(la, lb) + 0.05) / (math.min(la, lb) + 0.05);
}

/// How readable a foreground/background pair will be to a scanner.
enum QrContrastVerdict { inverted, tooLow, adequate, strong }

({QrContrastVerdict verdict, double ratio, String message}) assessContrast(
  Color foreground,
  Color background,
) {
  final ratio = contrastRatio(foreground, background);
  final text = '${ratio.toStringAsFixed(1)}:1';

  // Most scanners assume dark modules on a light ground and will not even try
  // the inverse, so this is a harder failure than a merely low ratio.
  if (relativeLuminance(foreground) > relativeLuminance(background)) {
    return (
      verdict: QrContrastVerdict.inverted,
      ratio: ratio,
      message: 'Modules lighter than background — most scanners will fail',
    );
  }
  if (ratio < 3) {
    return (
      verdict: QrContrastVerdict.tooLow,
      ratio: ratio,
      message: 'Contrast $text — too low, may not scan',
    );
  }
  if (ratio < 7) {
    return (
      verdict: QrContrastVerdict.adequate,
      ratio: ratio,
      message: 'Contrast $text — usually fine',
    );
  }
  return (
    verdict: QrContrastVerdict.strong,
    ratio: ratio,
    message: 'Contrast $text — scans reliably',
  );
}

/// Turns arbitrary input into a filename fragment, as the HTML's `slug()` does.
String slugify(String text) {
  final slug = text
      .replaceAll(RegExp(r'^https?://', caseSensitive: false), '')
      .replaceAll(RegExp(r'[^a-zA-Z0-9]+'), '-')
      .replaceAll(RegExp(r'^-+|-+$'), '')
      .toLowerCase();
  if (slug.isEmpty) return 'code';
  return slug.length > 28 ? slug.substring(0, 28) : slug;
}
