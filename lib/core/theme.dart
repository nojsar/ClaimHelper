import 'package:flutter/material.dart';

/// Bundled font families (see pubspec.yaml). Fonts ship inside the app so no
/// request ever goes to Google Fonts at runtime — a GDPR requirement.
abstract final class AppFonts {
  static const sans = 'IBMPlexSans';
  static const serif = 'Fraunces';
  static const mono = 'IBMPlexMono';
}

/// Calm, familiar healthcare-document colors shared with getmyyes.com.
/// Brand navy/teal are deliberately separate from destructive/error red.
abstract final class AppColors {
  // Trustworthy navy (brand / navigation / primary actions)
  static const primary = Color(0xFF17324D);
  static const primaryDark = Color(0xFF10263B);
  static const primaryDeep = Color(0xFF0B1D2D);
  static const primaryTint = Color(0xFFEDF3F8);

  // Calm teal (trust / progress / positive emphasis)
  static const accent = Color(0xFF2F6F62);
  static const accentBright = Color(0xFF24594F);
  static const accentTint = Color(0xFFEAF3F1);

  // Clear, high-contrast neutrals
  static const background = Color(0xFFF6F8F7);
  static const surface = Color(0xFFFFFFFF);
  static const surfaceAlt = Color(0xFFEAF0EE);
  static const textPrimary = Color(0xFF1F2B37);
  static const textSecondary = Color(0xFF4A5865);
  // Meets WCAG AA for normal text on both [background] and [surface].
  static const textMuted = Color(0xFF5F6E78);
  static const border = Color(0xFFC9D6D2);
  static const borderStrong = Color(0xFF95AAA3);
  // Persistent boundaries for form fields and other interactive controls.
  // Meets WCAG 1.4.11's 3:1 non-text contrast requirement on paper surfaces.
  static const controlBorder = textMuted;

  // Dark panels and primary buttons
  static const ink = primary;
  static const inkSoft = primaryDark;

  // Status
  static const warning = Color(0xFF805600);
  static const warningTint = Color(0xFFF8EDCE);
  static const error = Color(0xFFA3262F);
  static const errorTint = Color(0xFFF7E7E8);
}

/// Gradients used sparingly for hero washes, CTA bands, and brand marks.
abstract final class AppGradients {
  static const brand = LinearGradient(
    colors: [AppColors.primary, AppColors.accent],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const cta = LinearGradient(
    colors: [AppColors.ink, AppColors.inkSoft],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const heroWash = LinearGradient(
    colors: [Color(0xFFFFFFFF), AppColors.background, AppColors.background],
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
  );

  /// Navy into teal keeps emphasized text calm and recognizable.
  static const accentText = LinearGradient(
    colors: [AppColors.primary, AppColors.accent],
  );
}

/// Soft neutral shadows for familiar document cards.
abstract final class AppShadows {
  static const soft = [
    BoxShadow(
      color: Color(0x1F17324D),
      blurRadius: 24,
      offset: Offset(0, 8),
      spreadRadius: -6,
    ),
  ];

  static const lifted = [
    BoxShadow(
      color: Color(0x2917324D),
      blurRadius: 40,
      offset: Offset(0, 18),
      spreadRadius: -10,
    ),
  ];

  static const subtle = [
    BoxShadow(
      color: Color(0x1417324D),
      blurRadius: 12,
      offset: Offset(0, 4),
      spreadRadius: -4,
    ),
  ];
}

abstract final class AppRadii {
  static const sm = 6.0;
  static const md = 8.0;
  static const lg = 12.0;
  static const xl = 16.0;
}

/// Route transitions are disabled so the persistent header chrome never
/// zooms with navigation — AppScaffold animates the page *body* instead.
class NoTransitionsBuilder extends PageTransitionsBuilder {
  const NoTransitionsBuilder();
  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) =>
      child;
}

ThemeData buildAppTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: AppColors.primary,
    brightness: Brightness.light,
    primary: AppColors.primary,
    onPrimary: Colors.white,
    secondary: AppColors.accent,
    surface: AppColors.surface,
    error: AppColors.error,
  );

  // Landing pairing: Fraunces serif for headings, IBM Plex Sans for UI.
  final body = ThemeData(useMaterial3: true).textTheme.apply(
        fontFamily: AppFonts.sans,
        bodyColor: AppColors.textPrimary,
        displayColor: AppColors.textPrimary,
      );
  TextStyle serif(TextStyle? base, {FontWeight weight = FontWeight.w600}) =>
      (base ?? const TextStyle()).copyWith(
        fontFamily: AppFonts.serif,
        fontWeight: weight,
        color: AppColors.textPrimary,
        letterSpacing: -0.4,
      );
  final readableBody = body.copyWith(
    bodyLarge: body.bodyLarge?.copyWith(fontSize: 18, height: 1.55),
    bodyMedium: body.bodyMedium?.copyWith(fontSize: 16, height: 1.55),
    bodySmall: body.bodySmall?.copyWith(fontSize: 14.5, height: 1.5),
    labelLarge: body.labelLarge?.copyWith(
      fontSize: 16,
      fontWeight: FontWeight.w700,
    ),
    labelMedium: body.labelMedium?.copyWith(fontSize: 15),
    labelSmall: body.labelSmall?.copyWith(fontSize: 14),
  );
  final textTheme = readableBody.copyWith(
    displayLarge: serif(readableBody.displayLarge, weight: FontWeight.w700),
    displayMedium: serif(readableBody.displayMedium, weight: FontWeight.w700),
    displaySmall: serif(readableBody.displaySmall, weight: FontWeight.w700),
    headlineLarge: serif(readableBody.headlineLarge, weight: FontWeight.w700),
    headlineMedium: serif(readableBody.headlineMedium),
    headlineSmall: serif(readableBody.headlineSmall),
    titleLarge: serif(readableBody.titleLarge),
  );

  final base = ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: AppColors.background,
    textTheme: textTheme,
    splashFactory: InkSparkle.splashFactory,
    materialTapTargetSize: MaterialTapTargetSize.padded,
    visualDensity: VisualDensity.standard,
  );

  return base.copyWith(
    pageTransitionsTheme: const PageTransitionsTheme(builders: {
      TargetPlatform.android: NoTransitionsBuilder(),
      TargetPlatform.iOS: NoTransitionsBuilder(),
      TargetPlatform.linux: NoTransitionsBuilder(),
      TargetPlatform.macOS: NoTransitionsBuilder(),
      TargetPlatform.windows: NoTransitionsBuilder(),
      TargetPlatform.fuchsia: NoTransitionsBuilder(),
    }),
    appBarTheme: AppBarTheme(
      backgroundColor: AppColors.background.withValues(alpha: 0.92),
      surfaceTintColor: Colors.transparent,
      foregroundColor: AppColors.textPrimary,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: textTheme.titleLarge,
    ),
    cardTheme: CardThemeData(
      color: AppColors.surface,
      elevation: 0,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadii.lg),
        side: const BorderSide(color: AppColors.borderStrong, width: 0.8),
      ),
      margin: EdgeInsets.zero,
    ),
    // Large, conventional controls remain easy to read and target.
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.ink,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 26, vertical: 18),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.md),
        ),
        textStyle: const TextStyle(
          fontFamily: AppFonts.sans,
          fontWeight: FontWeight.w700,
          fontSize: 16,
        ),
        elevation: 0,
        minimumSize: const Size(52, 52),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.textPrimary,
        backgroundColor: Colors.transparent,
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18),
        side: const BorderSide(color: AppColors.ink, width: 1.3),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.md),
        ),
        textStyle: const TextStyle(
          fontFamily: AppFonts.sans,
          fontWeight: FontWeight.w700,
          fontSize: 16,
        ),
        minimumSize: const Size(52, 52),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: AppColors.primaryDark,
        textStyle: textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
        minimumSize: const Size(48, 48),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: AppColors.surface,
      selectedColor: AppColors.primaryTint,
      side: const BorderSide(color: AppColors.controlBorder),
      labelStyle: textTheme.bodyMedium?.copyWith(
        fontWeight: FontWeight.w600,
        color: AppColors.textPrimary,
      ),
      secondaryLabelStyle: textTheme.bodyMedium,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(999),
        side: const BorderSide(color: AppColors.controlBorder),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      floatingLabelStyle: const TextStyle(color: AppColors.primaryDark),
      labelStyle: const TextStyle(color: AppColors.textSecondary),
      hintStyle: const TextStyle(color: AppColors.textMuted),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadii.md),
        borderSide: const BorderSide(color: AppColors.controlBorder),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadii.md),
        borderSide: const BorderSide(color: AppColors.controlBorder),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadii.md),
        borderSide: const BorderSide(color: AppColors.primary, width: 1.6),
      ),
    ),
    dividerTheme: const DividerThemeData(
      color: AppColors.border,
      thickness: 1,
      space: 1,
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: AppColors.ink,
      contentTextStyle: const TextStyle(color: AppColors.background),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadii.sm),
      ),
    ),
    tabBarTheme: TabBarThemeData(
      labelColor: AppColors.primaryDark,
      unselectedLabelColor: AppColors.textSecondary,
      indicatorColor: AppColors.primary,
      dividerColor: AppColors.border,
      labelStyle: textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
      unselectedLabelStyle: textTheme.titleSmall,
    ),
  );
}
