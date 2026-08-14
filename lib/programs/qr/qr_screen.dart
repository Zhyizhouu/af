import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:qr/qr.dart';

import '../../app/file_delivery.dart';
import '../../theme/af_text.dart';
import '../../theme/af_tokens.dart';
import '../../widgets/af_button.dart';
import '../../widgets/af_field.dart';
import '../../widgets/af_panel.dart';
import '../../widgets/af_scaffold.dart';
import '../../widgets/af_segmented.dart';
import '../../widgets/af_text_field.dart';
import '../../widgets/af_theme_toggle.dart';
import 'qr_color_field.dart';
import 'qr_render.dart';
import 'qr_viewport.dart';

/// reAFresh · QR Generator — a native port of `AF-QRgenerator.html`.
class QrScreen extends StatefulWidget {
  const QrScreen({super.key});

  @override
  State<QrScreen> createState() => _QrScreenState();
}

class _QrScreenState extends State<QrScreen> {
  static const Map<int, String> _eccInfo = {
    QrErrorCorrectLevel.L: 'L · recovers ~7%',
    QrErrorCorrectLevel.M: 'M · recovers ~15%',
    QrErrorCorrectLevel.Q: 'Q · recovers ~25%',
    QrErrorCorrectLevel.H: 'H · recovers ~30%',
  };

  /// Preview never rasterises above this, however large the export is set —
  /// a 2048px re-render on every keystroke is wasted work.
  static const int _previewCap = 720;

  static const List<String> _rasterExtensions = [
    'png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif',
  ];

  final TextEditingController _textController = TextEditingController();

  String _text = '';
  int _ecc = QrErrorCorrectLevel.M;
  double _size = 640;
  double _quietZone = 4;
  Color _foreground = const Color(0xFF101319);
  Color _background = const Color(0xFFFFFFFF);
  double _logoScale = 0.16;

  QrImage? _matrix;
  ui.Image? _preview;
  String? _error;
  int _revision = 0;
  int _renderToken = 0;

  ui.Image? _logo;
  Uint8List? _logoBytes;
  String _logoName = '';
  String _logoMime = 'image/png';

  Timer? _debounce;
  Timer? _toastTimer;
  String _toast = '';
  bool _busy = false;

  @override
  void dispose() {
    _debounce?.cancel();
    _toastTimer?.cancel();
    _textController.dispose();
    _preview?.dispose();
    _logo?.dispose();
    super.dispose();
  }

  // ---- pipeline ----

  void _scheduleRebuild() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 140), _rebuild);
  }

  Future<void> _rebuild() async {
    final token = ++_renderToken;

    if (_text.isEmpty) {
      _apply(token, matrix: null, error: null, preview: null);
      return;
    }

    final result = encodeQr(_text, _ecc);
    if (!result.ok) {
      _apply(token, matrix: null, error: result.error, preview: null);
      return;
    }

    final matrix = result.image!;
    final quietZone = _quietZone.round();
    final total = matrix.moduleCount + quietZone * 2;

    ui.Image preview;
    try {
      preview = await rasterizeQr(
        image: matrix,
        quietZone: quietZone,
        // Never below one pixel per module, never above the preview cap.
        targetSize: math.max(total, math.min(_size.round(), _previewCap)),
        foreground: _foreground,
        background: _background,
        logo: _logo,
        logoScale: _logoScale,
      );
    } catch (_) {
      _apply(token, matrix: null, error: 'Could not draw the code.', preview: null);
      return;
    }

    _apply(token, matrix: matrix, error: null, preview: preview);
  }

  /// Commits a render, discarding it if a newer one has already been started.
  void _apply(
    int token, {
    required QrImage? matrix,
    required String? error,
    required ui.Image? preview,
  }) {
    if (token != _renderToken || !mounted) {
      preview?.dispose();
      return;
    }
    setState(() {
      _preview?.dispose();
      _preview = preview;
      _matrix = matrix;
      _error = error;
      if (preview != null) _revision++;
    });
  }

  void _showToast(String message) {
    setState(() => _toast = message);
    _toastTimer?.cancel();
    _toastTimer = Timer(const Duration(milliseconds: 1800), () {
      if (mounted) setState(() => _toast = '');
    });
  }

  // ---- exports ----

  String get _baseName => 'AF-QR-${slugify(_text)}';

  Future<void> _export({required bool svg, bool forceShare = false}) async {
    final matrix = _matrix;
    if (matrix == null || _busy) return;

    setState(() => _busy = true);
    try {
      final Uint8List bytes;
      if (svg) {
        bytes = utf8.encode(
          buildQrSvg(
            image: matrix,
            quietZone: _quietZone.round(),
            size: _size.round(),
            foreground: _foreground,
            background: _background,
            logoDataUri: _logoBytes == null
                ? null
                : 'data:$_logoMime;base64,${base64Encode(_logoBytes!)}',
            logoWidth: _logo?.width,
            logoHeight: _logo?.height,
            logoScale: _logoScale,
          ),
        );
      } else {
        // Re-render at full export size; the preview is deliberately smaller.
        final image = await rasterizeQr(
          image: matrix,
          quietZone: _quietZone.round(),
          targetSize: _size.round(),
          foreground: _foreground,
          background: _background,
          logo: _logo,
          logoScale: _logoScale,
        );
        try {
          bytes = await encodePng(image);
        } finally {
          image.dispose();
        }
      }

      final message = await deliverFile(
        bytes: bytes,
        fileName: '$_baseName.${svg ? 'svg' : 'png'}',
        mimeType: svg ? 'image/svg+xml' : 'image/png',
        forceShare: forceShare,
      );
      if (message != null) _showToast(message);
    } catch (_) {
      _showToast('Could not write the ${svg ? 'SVG' : 'PNG'}');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  // ---- logo ----

  Future<void> _pickLogo() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: _rasterExtensions,
      withData: true,
    );
    final file = result?.files.firstOrNull;
    if (file == null) return;

    final bytes = file.bytes;
    if (bytes == null) {
      _showToast('Could not read that file');
      return;
    }

    try {
      final image = await decodeImageFromList(bytes);
      if (!mounted) {
        image.dispose();
        return;
      }
      setState(() {
        _logo?.dispose();
        _logo = image;
        _logoBytes = bytes;
        _logoName = file.name;
        _logoMime = _mimeFor(file.extension);
      });
      _rebuild();
    } catch (_) {
      _showToast('Could not read that image');
    }
  }

  static String _mimeFor(String? extension) => switch (extension?.toLowerCase()) {
        'jpg' || 'jpeg' => 'image/jpeg',
        'webp' => 'image/webp',
        'gif' => 'image/gif',
        'bmp' => 'image/bmp',
        _ => 'image/png',
      };

  void _clearLogo() {
    setState(() {
      _logo?.dispose();
      _logo = null;
      _logoBytes = null;
      _logoName = '';
    });
    _rebuild();
  }

  ({String text, bool tip}) get _logoHint {
    if (_logo == null) return (text: '', tip: false);
    if (_ecc == QrErrorCorrectLevel.L || _ecc == QrErrorCorrectLevel.M) {
      return (
        text: 'Tip: set error correction to Q or H so the code still scans '
            'under the logo.',
        tip: true,
      );
    }
    return (
      text: 'Keep the logo small and scan-test with a real camera before use.',
      tip: false,
    );
  }

  // ---- build ----

  @override
  Widget build(BuildContext context) {
    return AFScaffold(
      title: 'reAFresh · QR Generator',
      tagline: 'make anything scannable — offline',
      onBack: () => Navigator.of(context).pop(),
      actions: const [AFThemeToggle()],
      footer: const AFFooter(
        'runs entirely on your device — nothing is uploaded',
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final twoColumn = constraints.maxWidth >= 760;

          if (twoColumn) {
            return SingleChildScrollView(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: _controls(context)),
                  const SizedBox(width: 20),
                  Expanded(child: _stage(context)),
                ],
              ),
            );
          }

          return SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _controls(context),
                const SizedBox(height: 20),
                _stage(context),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _controls(BuildContext context) {
    final t = context.af;
    final contrast = assessContrast(_foreground, _background);
    final hint = _logoHint;

    final contrastColor = switch (contrast.verdict) {
      QrContrastVerdict.inverted || QrContrastVerdict.tooLow => t.warn,
      QrContrastVerdict.adequate || QrContrastVerdict.strong => t.ok,
    };

    return AFPanel(
      label: 'Source',
      count: '${_text.characters.length} chars',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AFTextField(
            controller: _textController,
            hint: 'Paste a URL, text, Wi-Fi string, anything…',
            minLines: 4,
            maxLines: 8,
            onChanged: (value) {
              setState(() => _text = value);
              _scheduleRebuild();
            },
          ),

          AFField(
            label: 'Error correction',
            value: _eccInfo[_ecc],
            child: AFSegmented<int>(
              value: _ecc,
              onChanged: (value) {
                setState(() => _ecc = value);
                _rebuild();
              },
              segments: const [
                AFSegment(value: QrErrorCorrectLevel.L, label: 'L'),
                AFSegment(value: QrErrorCorrectLevel.M, label: 'M'),
                AFSegment(value: QrErrorCorrectLevel.Q, label: 'Q'),
                AFSegment(value: QrErrorCorrectLevel.H, label: 'H'),
              ],
            ),
          ),

          AFField(
            label: 'Export size',
            value: '${_size.round()} px',
            child: Slider(
              value: _size,
              min: 256,
              max: 2048,
              divisions: 56,
              onChanged: (value) => setState(() => _size = value),
              onChangeEnd: (_) => _rebuild(),
            ),
          ),

          AFField(
            label: 'Quiet zone',
            value: '${_quietZone.round()} '
                '${_quietZone.round() == 1 ? 'module' : 'modules'}',
            child: Slider(
              value: _quietZone,
              min: 0,
              max: 8,
              divisions: 8,
              onChanged: (value) => setState(() => _quietZone = value),
              onChangeEnd: (_) => _rebuild(),
            ),
          ),

          AFField(
            label: 'Colors',
            value: 'modules / background',
            child: Row(
              children: [
                Expanded(
                  child: QrColorField(
                    value: _foreground,
                    semanticLabel: 'Module colour',
                    onChanged: (value) {
                      setState(() => _foreground = value);
                      _scheduleRebuild();
                    },
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: QrColorField(
                    value: _background,
                    semanticLabel: 'Background colour',
                    onChanged: (value) {
                      setState(() => _background = value);
                      _scheduleRebuild();
                    },
                  ),
                ),
              ],
            ),
          ),
          AFStatusLine(text: contrast.message, color: contrastColor),

          AFField(
            label: 'Logo',
            value: 'optional · center overlay',
            child: _logoRow(context),
          ),

          if (_logo != null)
            AFField(
              label: 'Logo size',
              value: '${(_logoScale * 100).round()}%',
              topSpacing: 16,
              child: Slider(
                value: _logoScale * 100,
                min: 10,
                max: 25,
                divisions: 15,
                onChanged: (value) => setState(() => _logoScale = value / 100),
                onChangeEnd: (_) => _rebuild(),
              ),
            ),

          AFHint(hint.text, tip: hint.tip),
        ],
      ),
    );
  }

  Widget _logoRow(BuildContext context) {
    final t = context.af;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        if (_logo != null) ...[
          Container(
            width: 36,
            height: 36,
            padding: const EdgeInsets.all(2),
            decoration: BoxDecoration(
              color: t.panel,
              borderRadius: BorderRadius.circular(4),
              border: Border.all(color: t.lineStrong),
            ),
            child: RawImage(image: _logo, fit: BoxFit.contain),
          ),
          const SizedBox(width: 11),
        ],
        _DashedButton(
          label: _logo == null ? 'Upload image' : 'Replace image',
          onPressed: _pickLogo,
        ),
        const SizedBox(width: 11),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                _logo == null ? 'PNG, JPG or WebP' : _logoName,
                style: AFText.meta(context),
                overflow: TextOverflow.ellipsis,
              ),
              if (_logo != null)
                GestureDetector(
                  onTap: _clearLogo,
                  child: Text(
                    'remove',
                    style: AFText.mono(size: 11, color: t.warn).copyWith(
                      decoration: TextDecoration.underline,
                      decorationColor: t.warn,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _stage(BuildContext context) {
    final t = context.af;
    final matrix = _matrix;

    final String dims;
    if (matrix == null) {
      dims = '—';
    } else {
      final geometry = qrExportGeometry(
        moduleCount: matrix.moduleCount,
        quietZone: _quietZone.round(),
        targetSize: _size.round(),
      );
      dims = '${matrix.moduleCount}×${matrix.moduleCount} · '
          '${geometry.dimension}px';
    }

    final ready = matrix != null && !_busy;

    return AFPanel(
      label: 'Preview',
      count: dims,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          QrViewport(
            image: _preview,
            error: _error,
            emptyMessage: 'Type something on the left and your code appears here.',
            revision: _revision,
          ),

          Padding(
            padding: const EdgeInsets.fromLTRB(2, 14, 2, 12),
            child: Text.rich(
              TextSpan(
                style: AFText.mono(size: 12, color: t.muted),
                children: [
                  const TextSpan(text: 'save as → '),
                  TextSpan(
                    text: '$_baseName.png',
                    style: AFText.mono(
                      size: 12,
                      color: t.ink,
                      weight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),

          Row(
            children: [
              Expanded(
                child: AFButton(
                  label: 'Save PNG',
                  onPressed: ready ? () => _export(svg: false) : null,
                ),
              ),
              const SizedBox(width: 9),
              Expanded(
                child: AFButton.ghost(
                  label: 'Save SVG',
                  onPressed: ready ? () => _export(svg: true) : null,
                ),
              ),
            ],
          ),
          const SizedBox(height: 9),
          AFButton.ghost(
            label: 'Share image',
            expand: true,
            onPressed:
                ready ? () => _export(svg: false, forceShare: true) : null,
          ),

          SizedBox(
            height: 26,
            child: Center(
              child: AnimatedOpacity(
                opacity: _toast.isEmpty ? 0 : 1,
                duration: const Duration(milliseconds: 200),
                child: Text(
                  _toast,
                  textAlign: TextAlign.center,
                  style: AFText.mono(size: 11.5, color: t.accent, letterSpacing: 0.23),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// `.logo-btn` — a dashed upload affordance that turns accent on hover.
class _DashedButton extends StatefulWidget {
  final String label;
  final VoidCallback onPressed;

  const _DashedButton({required this.label, required this.onPressed});

  @override
  State<_DashedButton> createState() => _DashedButtonState();
}

class _DashedButtonState extends State<_DashedButton> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    final t = context.af;
    final color = _hovered ? t.accent : t.ink;

    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hovered = true),
      onExit: (_) => setState(() => _hovered = false),
      child: GestureDetector(
        onTap: widget.onPressed,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: t.sunken,
            borderRadius: t.borderRadius,
            border: Border.all(color: _hovered ? t.accent : t.lineStrong),
          ),
          child: Text(
            widget.label,
            style: AFText.mono(size: 12.5, color: color, weight: FontWeight.w600),
          ),
        ),
      ),
    );
  }
}
