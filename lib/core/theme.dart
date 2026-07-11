import 'package:flutter/material.dart';

/// Bundled font families (see pubspec.yaml). Fonts ship inside the app so no
/// request ever goes to Google Fonts at runtime — a GDPR requirement.
abstract final class AppFonts {
  static const sans = 'IBMPlexSans';
  static const serif = 'Fraunces';
  static const mono = 'IBMPlexMono';
}

/// THE CASE FILE — the app wears the same paper world as getmyyes.com:
/// bone paper, warm ink, carmine stamp red, approval green, letterpress type.
abstract final class AppColors {
  // Stamp carmine (brand / emphasis)
  static const primary = Color(0xFFB3202A); // carmine — spinners, accents
  static const primaryDark = Color(0xFF8F1922); // deep carmine for links/text
  static const primaryDeep = Color(0xFF6E1219); // darkest red (gradients)
  static const primaryTint = Color(0xFFF3E2DE); // red-tinted paper wash

  // Approval green (success / progress)
  static const accent = Color(0xFF14724F);
  static const accentBright = Color(0xFF1E9A6B);
  static const accentTint = Color(0xFFE4EDE0);

  // Paper & ink neutrals
  static const background = Color(0xFFF3EDDF); // bone paper
  static const surface = Color(0xFFFBF7EC); // letter paper
  static const surfaceAlt = Color(0xFFEAE1CC); // deeper cream
  static const textPrimary = Color(0xFF1C160C); // warm ink
  static const textSecondary = Color(0xFF57503F);
  static const textMuted = Color(0xFF7A7159);
  static const border = Color(0xFFDCD2BA);
  static const borderStrong = Color(0xFFB9AC8F);

  // Ink (buttons, footer, dark panels)
  static const ink = Color(0xFF1C160C);
  static const inkSoft = Color(0xFF2A2213);

  // Status
  static const warning = Color(0xFF8C5A08);
  static const warningTint = Color(0xFFF4E8CB);
  static const error = Color(0xFFB3202A);
  static const errorTint = Color(0xFFF5DFDD);
}

/// Gradients used sparingly for hero washes, CTA bands, and brand marks.
abstract final class AppGradients {
  static const brand = LinearGradient(
    colors: [AppColors.primary, Color(0xFFD92632)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const cta = LinearGradient(
    colors: [AppColors.ink, AppColors.inkSoft],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const heroWash = LinearGradient(
    colors: [Color(0xFFF7F1E3), Color(0xFFF3EDDF), Color(0xFFF3EDDF)],
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
  );

  /// NO-red into YES-green — the whole product in one gradient.
  static const accentText = LinearGradient(
    colors: [AppColors.primary, AppColors.accent],
  );
}

/// Warm paper shadows — graphite on a desk, never cold blue.
abstract final class AppShadows {
  static const soft = [
    BoxShadow(
      color: Color(0x1F3C2E12),
      blurRadius: 24,
      offset: Offset(0, 8),
      spreadRadius: -6,
    ),
  ];

  static const lifted = [
    BoxShadow(
      color: Color(0x333C2E12),
      blurRadius: 40,
      offset: Offset(0, 18),
      spreadRadius: -10,
    ),
  ];

  static const subtle = [
    BoxShadow(
      color: Color(0x143C2E12),
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
  final textTheme = body.copyWith(
    displayLarge: serif(body.displayLarge, weight: FontWeight.w700),
    displayMedium: serif(body.displayMedium, weight: FontWeight.w700),
    displaySmall: serif(body.displaySmall, weight: FontWeight.w700),
    headlineLarge: serif(body.headlineLarge, weight: FontWeight.w700),
    headlineMedium: serif(body.headlineMedium),
    headlineSmall: serif(body.headlineSmall),
    titleLarge: serif(body.titleLarge),
  );

  final base = ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: AppColors.background,
    textTheme: textTheme,
    splashFactory: InkSparkle.splashFactory,
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
    // Primary actions are ink-black documents stamps — like the landing.
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.ink,
        foregroundColor: AppColors.background,
        padding: const EdgeInsets.symmetric(horizontal: 26, vertical: 18),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.sm),
        ),
        textStyle: const TextStyle(
          fontFamily: AppFonts.mono,
          fontWeight: FontWeight.w600,
          fontSize: 14,
          letterSpacing: 0.8,
        ),
        elevation: 0,
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.textPrimary,
        backgroundColor: Colors.transparent,
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18),
        side: const BorderSide(color: AppColors.ink, width: 1.3),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.sm),
        ),
        textStyle: const TextStyle(
          fontFamily: AppFonts.mono,
          fontWeight: FontWeight.w600,
          fontSize: 13.5,
          letterSpacing: 0.8,
        ),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: AppColors.primaryDark,
        textStyle: textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: AppColors.surface,
      selectedColor: AppColors.primaryTint,
      side: const BorderSide(color: AppColors.borderStrong),
      labelStyle: textTheme.bodyMedium?.copyWith(
        fontWeight: FontWeight.w600,
        color: AppColors.textPrimary,
      ),
      secondaryLabelStyle: textTheme.bodyMedium,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(999),
        side: const BorderSide(color: AppColors.borderStrong),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.surface,
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      floatingLabelStyle: const TextStyle(color: AppColors.primaryDark),
      labelStyle: const TextStyle(color: AppColors.textSecondary),
      hintStyle: const TextStyle(color: AppColors.textMuted),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadii.md),
        borderSide: const BorderSide(color: AppColors.borderStrong),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadii.md),
        borderSide: const BorderSide(color: AppColors.borderStrong),
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
