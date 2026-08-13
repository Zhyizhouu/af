import 'package:flutter/material.dart';

import 'af_text.dart';
import 'af_tokens.dart';

/// Builds Material themes from [AFTokens].
///
/// Most of the app is drawn with the `AF*` widgets rather than stock Material
/// components, so this exists mainly to make the framework-owned surfaces
/// (dialogs, pickers, snackbars, checkboxes, text selection) match the rest
/// instead of falling back to default Material styling.
class AppTheme {
  AppTheme._();

  static ThemeData get light => _build(AFTokens.light, Brightness.light);

  static ThemeData get dark => _build(AFTokens.dark, Brightness.dark);

  static ThemeData _build(AFTokens t, Brightness brightness) {
    final shape = RoundedRectangleBorder(
      borderRadius: t.borderRadius,
      side: BorderSide(color: t.line),
    );

    final base = ThemeData(
      useMaterial3: true,
      brightness: brightness,
      scaffoldBackgroundColor: t.desk,
      canvasColor: t.panel,
      dividerColor: t.line,
      splashFactory: InkRipple.splashFactory,
      colorScheme: ColorScheme(
        brightness: brightness,
        primary: t.accent,
        onPrimary: Colors.white,
        secondary: t.ink,
        onSecondary: t.onInk,
        error: t.warn,
        onError: Colors.white,
        surface: t.panel,
        onSurface: t.ink,
        surfaceContainerHighest: t.sunken,
        outline: t.lineStrong,
        outlineVariant: t.line,
      ),
    );

    return base.copyWith(
      extensions: <ThemeExtension<dynamic>>[t],
      textTheme: base.textTheme.apply(
        bodyColor: t.ink,
        displayColor: t.ink,
      ),
      dividerTheme: DividerThemeData(color: t.line, thickness: 1, space: 1),
      iconTheme: IconThemeData(color: t.muted, size: 18),
      dialogTheme: DialogThemeData(
        backgroundColor: t.panel,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        shape: shape,
        titleTextStyle: AFText.mono(
          size: 11,
          color: t.muted,
          letterSpacing: 1.54,
        ),
        contentTextStyle: TextStyle(fontSize: 14.5, height: 1.5, color: t.ink),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: t.panel,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        shape: shape,
      ),
      cardTheme: CardThemeData(
        color: t.panel,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: shape,
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: t.ink,
        contentTextStyle: AFText.mono(
          size: 12.5,
          color: t.onInk,
          letterSpacing: 0.25,
        ),
        actionTextColor: t.accent,
        behavior: SnackBarBehavior.floating,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: t.borderRadius),
      ),
      checkboxTheme: CheckboxThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(2)),
        side: BorderSide(color: t.lineStrong, width: 1.5),
        fillColor: WidgetStateProperty.resolveWith((states) {
          return states.contains(WidgetState.selected) ? t.accent : t.sunken;
        }),
        checkColor: const WidgetStatePropertyAll(Colors.white),
        visualDensity: VisualDensity.compact,
      ),
      radioTheme: RadioThemeData(
        fillColor: WidgetStateProperty.resolveWith((states) {
          return states.contains(WidgetState.selected) ? t.accent : t.lineStrong;
        }),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((states) {
          return states.contains(WidgetState.selected) ? Colors.white : t.muted;
        }),
        trackColor: WidgetStateProperty.resolveWith((states) {
          return states.contains(WidgetState.selected) ? t.accent : t.sunken;
        }),
        trackOutlineColor: WidgetStatePropertyAll(t.lineStrong),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(
        color: t.accent,
        linearTrackColor: t.sunken,
        circularTrackColor: t.sunken,
        linearMinHeight: 6,
      ),
      sliderTheme: SliderThemeData(
        trackHeight: 2,
        activeTrackColor: t.ink,
        inactiveTrackColor: t.lineStrong,
        thumbColor: t.ink,
        overlayColor: t.accentSoft,
        thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 8),
        overlayShape: const RoundSliderOverlayShape(overlayRadius: 16),
        showValueIndicator: ShowValueIndicator.never,
      ),
      textSelectionTheme: TextSelectionThemeData(
        cursorColor: t.accent,
        selectionColor: t.accentSoft,
        selectionHandleColor: t.accent,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: t.sunken,
        contentPadding: const EdgeInsets.symmetric(horizontal: 13, vertical: 12),
        hintStyle: AFText.mono(size: 14, color: t.muted),
        labelStyle: AFText.mono(size: 12, color: t.muted, letterSpacing: 0.48),
        floatingLabelStyle: AFText.mono(size: 12, color: t.accent, letterSpacing: 0.48),
        enabledBorder: OutlineInputBorder(
          borderRadius: t.borderRadius,
          borderSide: BorderSide(color: t.lineStrong),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: t.borderRadius,
          borderSide: BorderSide(color: t.accent),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: t.borderRadius,
          borderSide: BorderSide(color: t.warn),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: t.borderRadius,
          borderSide: BorderSide(color: t.warn),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: t.ink,
          shape: RoundedRectangleBorder(borderRadius: t.borderRadius),
          textStyle: AFText.mono(size: 13, weight: FontWeight.w600, letterSpacing: 0.26),
        ),
      ),
      // Date/time pickers are framework-drawn; square them off so they do not
      // arrive as 28px-radius Material blobs in the middle of this look.
      datePickerTheme: DatePickerThemeData(
        backgroundColor: t.panel,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        shape: shape,
        headerBackgroundColor: t.ink,
        headerForegroundColor: t.onInk,
        dayShape: WidgetStatePropertyAll(
          RoundedRectangleBorder(borderRadius: BorderRadius.circular(2)),
        ),
        todayBorder: BorderSide(color: t.accent),
      ),
      timePickerTheme: TimePickerThemeData(
        backgroundColor: t.panel,
        elevation: 0,
        shape: shape,
        dialBackgroundColor: t.sunken,
        hourMinuteShape: RoundedRectangleBorder(borderRadius: t.borderRadius),
      ),
      popupMenuTheme: PopupMenuThemeData(
        color: t.panel,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        shape: shape,
        textStyle: TextStyle(fontSize: 14.5, color: t.ink),
      ),
      menuTheme: MenuThemeData(
        style: MenuStyle(
          backgroundColor: WidgetStatePropertyAll(t.panel),
          surfaceTintColor: const WidgetStatePropertyAll(Colors.transparent),
          elevation: const WidgetStatePropertyAll(0),
          shape: WidgetStatePropertyAll(shape),
        ),
      ),
      tooltipTheme: TooltipThemeData(
        decoration: BoxDecoration(color: t.ink, borderRadius: t.borderRadius),
        textStyle: AFText.mono(size: 11.5, color: t.onInk),
      ),
    );
  }
}
