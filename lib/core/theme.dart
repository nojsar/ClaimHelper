import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// GetMyYes dark clinical palette — calm medical teal/cyan on deep marine
/// surfaces: the trust of a hospital brand with the drama of the landing.
abstract final class AppColors {
  // Clinical cyan (brand)
  static const primary = Color(0xFF0891B2); // cyan-600 (buttons/brand)
  static const primaryDark = Color(0xFF67E8F9); // readable cyan on dark
  static const primaryDeep = Color(0xFF155E75); // cyan-800 (gradients)
  static const primaryTint = Color(0xFF0B2530); // soft wash behind cyan

  // Reassuring health accent
  static const accent = Color(0xFF2DD4BF); // teal-400
  static const accentBright = Color(0xFF5EEAD4);
  static const accentTint = Color(0xFF0A2723);

  // Neutrals — deep marine, slightly green-shifted for the medical feel
  static const background = Color(0xFF06121B);
  static const surface = Color(0xFF0D1F2D);
  static const surfaceAlt = Color(0xFF091A26);
  static const textPrimary = Color(0xFFE9F3F9);
  static const textSecondary = Color(0xFFA7BCCB);
  static const textMuted = Color(0xFF64808F);
  static const border = Color(0xFF1D3A4C);
  static const borderStrong = Color(0xFF2F566C);

  // Status
  static const warning = Color(0xFFFBBF24);
  static const warningTint = Color(0xFF2A2010);
  static const error = Color(0xFFF87171);
  static const errorTint = Color(0xFF2A1418);
}

/// Gradients used sparingly for hero washes, CTA bands, and brand marks.
abstract final class AppGradients {
  static const brand = LinearGradient(
    colors: [AppColors.primary, Color(0xFF22D3EE)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const cta = LinearGradient(
    colors: [AppColors.primary, AppColors.primaryDeep],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const heroWash = LinearGradient(
    colors: [Color(0xFF081925), Color(0xFF06121B), Color(0xFF06121B)],
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
  );

  static const accentText = LinearGradient(
    colors: [AppColors.primaryDark, AppColors.accentBright],
  );
}

/// Soft, layered shadows — never harsh.
abstract final class AppShadows {
  static const soft = [
    BoxShadow(
      color: Color(0x0F1E293B),
      blurRadius: 24,
      offset: Offset(0, 8),
      spreadRadius: -6,
    ),
  ];

  static const lifted = [
    BoxShadow(
      color: Color(0x1A1E40AF),
      blurRadius: 40,
      offset: Offset(0, 18),
      spreadRadius: -10,
    ),
  ];

  static const subtle = [
    BoxShadow(
      color: Color(0x0A0F172A),
      blurRadius: 12,
      offset: Offset(0, 4),
      spreadRadius: -4,
    ),
  ];
}

abstract final class AppRadii {
  static const sm = 10.0;
  static const md = 14.0;
  static const lg = 20.0;
  static const xl = 28.0;
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
    brightness: Brightness.dark,
    primary: AppColors.primary,
    onPrimary: Colors.white,
    secondary: AppColors.accent,
    surface: AppColors.surface,
    error: AppColors.error,
  );

  final textTheme = GoogleFonts.plusJakartaSansTextTheme().apply(
    bodyColor: AppColors.textPrimary,
    displayColor: AppColors.textPrimary,
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
      backgroundColor: AppColors.surface.withValues(alpha: 0.85),
      surfaceTintColor: Colors.transparent,
      foregroundColor: AppColors.textPrimary,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: textTheme.titleLarge?.copyWith(
        fontWeight: FontWeight.w700,
      ),
    ),
    cardTheme: CardThemeData(
      color: AppColors.surface,
      elevation: 0,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadii.lg),
        side: const BorderSide(color: AppColors.border),
      ),
      margin: EdgeInsets.zero,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 26, vertical: 18),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.md),
        ),
        textStyle: textTheme.titleMedium?.copyWith(
          fontWeight: FontWeight.w700,
          letterSpacing: 0.1,
        ),
        elevation: 0,
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.primaryDark,
        backgroundColor: AppColors.surface,
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18),
        side: const BorderSide(color: AppColors.borderStrong),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.md),
        ),
        textStyle: textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
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
      side: const BorderSide(color: AppColors.border),
      labelStyle: textTheme.bodyMedium?.copyWith(
        fontWeight: FontWeight.w600,
        color: AppColors.textPrimary,
      ),
      secondaryLabelStyle: textTheme.bodyMedium,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(999),
        side: const BorderSide(color: AppColors.border),
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
        borderSide: const BorderSide(color: AppColors.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadii.md),
        borderSide: const BorderSide(color: AppColors.border),
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
      backgroundColor: const Color(0xFF143243),
      contentTextStyle: const TextStyle(color: Colors.white),
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
