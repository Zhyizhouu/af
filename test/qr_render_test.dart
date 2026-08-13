import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:qr/qr.dart';

import 'package:af/programs/qr/qr_render.dart';

void main() {
  group('parseHex', () {
    test('accepts 6-digit hex with and without a hash', () {
      expect(parseHex('#3B49FF'), const Color(0xFF3B49FF));
      expect(parseHex('3b49ff'), const Color(0xFF3B49FF));
    });

    test('expands 3-digit shorthand', () {
      expect(parseHex('#FFF'), const Color(0xFFFFFFFF));
      expect(parseHex('#08F'), const Color(0xFF0088FF));
    });

    test('rejects malformed input', () {
      expect(parseHex(''), isNull);
      expect(parseHex('#12345'), isNull);
      expect(parseHex('#GGGGGG'), isNull);
    });
  });

  test('toHex round-trips through parseHex', () {
    const color = Color(0xFF101319);
    expect(toHex(color), '#101319');
    expect(parseHex(toHex(color)), color);
  });

  group('assessContrast', () {
    test('flags light-on-dark as inverted regardless of ratio', () {
      final result = assessContrast(
        const Color(0xFFFFFFFF),
        const Color(0xFF000000),
      );
      expect(result.verdict, QrContrastVerdict.inverted);
    });

    test('rates black on white as strong', () {
      final result = assessContrast(
        const Color(0xFF000000),
        const Color(0xFFFFFFFF),
      );
      expect(result.verdict, QrContrastVerdict.strong);
      expect(result.ratio, closeTo(21, 0.1));
    });

    test('flags a too-low ratio', () {
      final result = assessContrast(
        const Color(0xFF888888),
        const Color(0xFFAAAAAA),
      );
      expect(result.verdict, QrContrastVerdict.tooLow);
    });
  });

  group('slugify', () {
    test('strips the scheme and punctuation', () {
      expect(slugify('https://binus.ac.id/exam'), 'binus-ac-id-exam');
    });

    test('caps length and falls back for empty input', () {
      expect(slugify('!!!'), 'code');
      expect(slugify('a' * 60).length, 28);
    });
  });

  group('qrExportGeometry', () {
    test('keeps cells whole so modules land on exact pixels', () {
      final geometry = qrExportGeometry(
        moduleCount: 25,
        quietZone: 4,
        targetSize: 640,
      );
      // 25 + 8 = 33 modules; 640 / 33 = 19.39 -> 19px cells.
      expect(geometry.cell, 19);
      expect(geometry.dimension, 19 * 33);
      expect(geometry.dimension, lessThanOrEqualTo(640));
    });

    test('never drops below one pixel per module', () {
      final geometry = qrExportGeometry(
        moduleCount: 177,
        quietZone: 4,
        targetSize: 32,
      );
      expect(geometry.cell, 1);
      expect(geometry.dimension, 185);
    });
  });

  group('encodeQr', () {
    test('encodes ordinary text', () {
      final result = encodeQr('https://binus.ac.id', QrErrorCorrectLevel.M);
      expect(result.ok, isTrue);
      expect(result.image!.moduleCount, greaterThan(20));
    });

    test('reports an error instead of throwing when input is too long', () {
      // Version 40/H tops out well under 3000 bytes.
      final result = encodeQr('x' * 5000, QrErrorCorrectLevel.H);
      expect(result.ok, isFalse);
      expect(result.error, contains('Too much data'));
    });
  });

  group('buildQrSvg', () {
    test('emits a viewBox that includes the quiet zone', () {
      final matrix = encodeQr('AF', QrErrorCorrectLevel.M).image!;
      final svg = buildQrSvg(
        image: matrix,
        quietZone: 4,
        size: 640,
        foreground: const Color(0xFF101319),
        background: const Color(0xFFFFFFFF),
      );

      final total = matrix.moduleCount + 8;
      expect(svg, contains('viewBox="0 0 $total $total"'));
      expect(svg, contains('width="640" height="640"'));
      expect(svg, contains('fill="#101319"'));
      expect(svg, contains('shape-rendering="crispEdges"'));
      expect(svg, endsWith('</svg>'));
    });
  });
}
