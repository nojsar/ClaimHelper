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

/// The brand roles a screen paints with, resolved for the current light or
/// dark appearance. Read it with `context.palette`; never paint the app with
/// [AppColors] directly, because those constants are the light (paper)
/// values. They stay for printed output and for the brand contract tests.
///
/// Dark values match getmyyes.com's `prefers-color-scheme: dark` tokens
/// (web/home.css): navy and teal become light text roles, and fills get
/// their own dark values. The one primary action is mint on ink, as on the
/// site.
@immutable
class AppPalette extends ThemeExtension<AppPalette> {
  const AppPalette({
    required this.primary,
    required this.primaryDark,
    required this.primaryDeep,
    required this.primaryTint,
    required this.accent,
    required this.accentBright,
    required this.accentTint,
    required this.background,
    required this.surface,
    required this.surfaceAlt,
    required this.textPrimary,
    required this.textSecondary,
    required this.textMuted,
    required this.border,
    required this.borderStrong,
    required this.controlBorder,
    required this.ink,
    required this.inkSoft,
    required this.onInk,
    required this.panel,
    required this.panelAction,
    required this.warning,
    required this.warningTint,
    required this.error,
    required this.errorTint,
    required this.onError,
    required this.brandGradient,
    required this.ctaGradient,
    required this.heroWash,
    required this.accentTextGradient,
    required this.shadowSoft,
    required this.shadowLifted,
    required this.shadowSubtle,
  });

  final Color primary;
  final Color primaryDark;
  final Color primaryDeep;
  final Color primaryTint;
  final Color accent;
  final Color accentBright;
  final Color accentTint;
  final Color background;
  final Color surface;
  final Color surfaceAlt;
  final Color textPrimary;
  final Color textSecondary;
  final Color textMuted;
  final Color border;
  final Color borderStrong;
  final Color controlBorder;

  /// Primary action fill and the text, icons and spinners drawn on it.
  final Color ink;
  final Color inkSoft;
  final Color onInk;

  /// A deep navy band that stays dark in both appearances; white text on it.
  final Color panel;

  /// The light button that sits on [panel] or [ctaGradient]. Its label is
  /// always [AppColors.primaryDark].
  final Color panelAction;

  final Color warning;
  final Color warningTint;
  final Color error;
  final Color errorTint;
  final Color onError;

  final LinearGradient brandGradient;
  final LinearGradient ctaGradient;
  final LinearGradient heroWash;
  final LinearGradient accentTextGradient;

  final List<BoxShadow> shadowSoft;
  final List<BoxShadow> shadowLifted;
  final List<BoxShadow> shadowSubtle;

  static const light = AppPalette(
    primary: AppColors.primary,
    primaryDark: AppColors.primaryDark,
    primaryDeep: AppColors.primaryDeep,
    primaryTint: AppColors.primaryTint,
    accent: AppColors.accent,
    accentBright: AppColors.accentBright,
    accentTint: AppColors.accentTint,
    background: AppColors.background,
    surface: AppColors.surface,
    surfaceAlt: AppColors.surfaceAlt,
    textPrimary: AppColors.textPrimary,
    textSecondary: AppColors.textSecondary,
    textMuted: AppColors.textMuted,
    border: AppColors.border,
    borderStrong: AppColors.borderStrong,
    controlBorder: AppColors.controlBorder,
    ink: AppColors.ink,
    inkSoft: AppColors.inkSoft,
    onInk: Colors.white,
    panel: AppColors.ink,
    panelAction: Colors.white,
    warning: AppColors.warning,
    warningTint: AppColors.warningTint,
    error: AppColors.error,
    errorTint: AppColors.errorTint,
    onError: Colors.white,
    brandGradient: AppGradients.brand,
    ctaGradient: AppGradients.cta,
    heroWash: AppGradients.heroWash,
    accentTextGradient: AppGradients.accentText,
    shadowSoft: AppShadows.soft,
    shadowLifted: AppShadows.lifted,
    shadowSubtle: AppShadows.subtle,
  );

  static const dark = AppPalette(
    primary: Color(0xFFCFE0EE),
    primaryDark: Color(0xFFF2F6F8),
    primaryDeep: Color(0xFFF2F6F8),
    primaryTint: Color(0xFF152534),
    accent: Color(0xFF7CCBB8),
    accentBright: Color(0xFF8FD3C2),
    accentTint: Color(0xFF162B2C),
    background: Color(0xFF0E1922),
    surface: Color(0xFF15222D),
    surfaceAlt: Color(0xFF1D2D39),
    textPrimary: Color(0xFFE7EDF0),
    textSecondary: Color(0xFFBAC6CD),
    textMuted: Color(0xFF93A2AC),
    border: Color(0xFF2A3A46),
    borderStrong: Color(0xFF5E7382),
    controlBorder: Color(0xFF93A2AC),
    ink: Color(0xFFA9DED2),
    inkSoft: Color(0xFFC3EADF),
    onInk: Color(0xFF0E1922),
    panel: Color(0xFF12283B),
    panelAction: Color(0xFFE7EDF0),
    warning: Color(0xFFE6BE6A),
    warningTint: Color(0xFF2C2617),
    error: Color(0xFFF08A92),
    errorTint: Color(0xFF36202A),
    onError: Color(0xFF0E1922),
    brandGradient: LinearGradient(
      colors: [Color(0xFF1C3A55), Color(0xFF2F6F62)],
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
    ),
    ctaGradient: LinearGradient(
      colors: [Color(0xFF182B3B), Color(0xFF10263B)],
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
    ),
    heroWash: LinearGradient(
      colors: [Color(0xFF101D28), Color(0xFF0E1922), Color(0xFF0E1922)],
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
    ),
    accentTextGradient: LinearGradient(
      colors: [Color(0xFFCFE0EE), Color(0xFF8FD3C2)],
    ),
    shadowSoft: [
      BoxShadow(
        color: Color(0x66000000),
        blurRadius: 24,
        offset: Offset(0, 8),
        spreadRadius: -6,
      ),
    ],
    shadowLifted: [
      BoxShadow(
        color: Color(0x99000000),
        blurRadius: 40,
        offset: Offset(0, 18),
        spreadRadius: -10,
      ),
    ],
    shadowSubtle: [
      BoxShadow(
        color: Color(0x59000000),
        blurRadius: 12,
        offset: Offset(0, 4),
        spreadRadius: -4,
      ),
    ],
  );

  /// Nothing overrides single roles; light and dark are complete palettes.
  @override
  AppPalette copyWith() => this;

  @override
  AppPalette lerp(covariant AppPalette? other, double t) {
    if (other == null) return this;
    Color c(Color a, Color b) => Color.lerp(a, b, t)!;
    LinearGradient g(LinearGradient a, LinearGradient b) =>
        LinearGradient.lerp(a, b, t)!;
    List<BoxShadow> s(List<BoxShadow> a, List<BoxShadow> b) =>
        BoxShadow.lerpList(a, b, t)!;
    return AppPalette(
      primary: c(primary, other.primary),
      primaryDark: c(primaryDark, other.primaryDark),
      primaryDeep: c(primaryDeep, other.primaryDeep),
      primaryTint: c(primaryTint, other.primaryTint),
      accent: c(accent, other.accent),
      accentBright: c(accentBright, other.accentBright),
      accentTint: c(accentTint, other.accentTint),
      background: c(background, other.background),
      surface: c(surface, other.surface),
      surfaceAlt: c(surfaceAlt, other.surfaceAlt),
      textPrimary: c(textPrimary, other.textPrimary),
      textSecondary: c(textSecondary, other.textSecondary),
      textMuted: c(textMuted, other.textMuted),
      border: c(border, other.border),
      borderStrong: c(borderStrong, other.borderStrong),
      controlBorder: c(controlBorder, other.controlBorder),
      ink: c(ink, other.ink),
      inkSoft: c(inkSoft, other.inkSoft),
      onInk: c(onInk, other.onInk),
      panel: c(panel, other.panel),
      panelAction: c(panelAction, other.panelAction),
      warning: c(warning, other.warning),
      warningTint: c(warningTint, other.warningTint),
      error: c(error, other.error),
      errorTint: c(errorTint, other.errorTint),
      onError: c(onError, other.onError),
      brandGradient: g(brandGradient, other.brandGradient),
      ctaGradient: g(ctaGradient, other.ctaGradient),
      heroWash: g(heroWash, other.heroWash),
      accentTextGradient: g(accentTextGradient, other.accentTextGradient),
      shadowSoft: s(shadowSoft, other.shadowSoft),
      shadowLifted: s(shadowLifted, other.shadowLifted),
      shadowSubtle: s(shadowSubtle, other.shadowSubtle),
    );
  }
}

extension AppPaletteContext on BuildContext {
  /// The brand palette for the current appearance. Falls back to light when
  /// a widget is pumped without the app theme (some tests do).
  AppPalette get palette =>
      Theme.of(this).extension<AppPalette>() ?? AppPalette.light;
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

/// The app theme for [brightness]. MaterialApp gets both and follows the
/// system setting, like getmyyes.com does.
ThemeData buildAppTheme({Brightness brightness = Brightness.light}) {
  final dark = brightness == Brightness.dark;
  final p = dark ? AppPalette.dark : AppPalette.light;
  final scheme = ColorScheme.fromSeed(
    seedColor: AppColors.primary,
    brightness: brightness,
    primary: p.primary,
    onPrimary: dark ? p.onInk : Colors.white,
    secondary: p.accent,
    surface: p.surface,
    error: p.error,
    // Light keeps the seed's derived roles. Dark pins them to the site's
    // tokens, and gives sheets, menus and dialogs navy, not grey, tones.
    onSecondary: dark ? p.onInk : null,
    onSurface: dark ? p.textPrimary : null,
    onSurfaceVariant: dark ? p.textSecondary : null,
    outline: dark ? p.controlBorder : null,
    outlineVariant: dark ? p.border : null,
    onError: dark ? p.onError : null,
    surfaceContainerLowest: dark ? const Color(0xFF0B151D) : null,
    surfaceContainerLow: dark ? p.surface : null,
    surfaceContainer: dark ? const Color(0xFF18262F) : null,
    surfaceContainerHigh: dark ? p.surfaceAlt : null,
    surfaceContainerHighest: dark ? const Color(0xFF233543) : null,
  );

  // Landing pairing: Fraunces serif for headings, IBM Plex Sans for UI.
  // Built from this scheme so underlines (decorationColor) follow onSurface;
  // a default ThemeData would leave them near-black in dark mode.
  final body =
      ThemeData(useMaterial3: true, colorScheme: scheme).textTheme.apply(
            fontFamily: AppFonts.sans,
            bodyColor: p.textPrimary,
            displayColor: p.textPrimary,
          );
  TextStyle serif(TextStyle? base, {FontWeight weight = FontWeight.w600}) =>
      (base ?? const TextStyle()).copyWith(
        fontFamily: AppFonts.serif,
        fontWeight: weight,
        color: p.textPrimary,
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
    brightness: brightness,
    colorScheme: scheme,
    extensions: [p],
    scaffoldBackgroundColor: p.background,
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
      backgroundColor: p.background.withValues(alpha: 0.92),
      surfaceTintColor: Colors.transparent,
      foregroundColor: p.textPrimary,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: textTheme.titleLarge,
    ),
    cardTheme: CardThemeData(
      color: p.surface,
      elevation: 0,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadii.lg),
        side: BorderSide(color: p.borderStrong, width: 0.8),
      ),
      margin: EdgeInsets.zero,
    ),
    // Large, conventional controls remain easy to read and target.
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: p.ink,
        foregroundColor: p.onInk,
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
        foregroundColor: p.textPrimary,
        backgroundColor: Colors.transparent,
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18),
        side: BorderSide(color: p.primary, width: 1.3),
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
        foregroundColor: p.primaryDark,
        textStyle: textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
        minimumSize: const Size(48, 48),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: p.surface,
      // In dark, primaryTint sits too close to the chip's own surface for a
      // selection to read at a glance.
      selectedColor: dark ? const Color(0xFF223D55) : p.primaryTint,
      side: BorderSide(color: p.controlBorder),
      labelStyle: textTheme.bodyMedium?.copyWith(
        fontWeight: FontWeight.w600,
        color: p.textPrimary,
      ),
      secondaryLabelStyle: textTheme.bodyMedium,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(999),
        side: BorderSide(color: p.controlBorder),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: p.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      floatingLabelStyle: TextStyle(color: p.primaryDark),
      labelStyle: TextStyle(color: p.textSecondary),
      hintStyle: TextStyle(color: p.textMuted),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadii.md),
        borderSide: BorderSide(color: p.controlBorder),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadii.md),
        borderSide: BorderSide(color: p.controlBorder),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadii.md),
        borderSide: BorderSide(color: p.primary, width: 1.6),
      ),
    ),
    dividerTheme: DividerThemeData(
      color: p.border,
      thickness: 1,
      space: 1,
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: p.ink,
      contentTextStyle: TextStyle(color: p.background),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadii.sm),
      ),
    ),
    tabBarTheme: TabBarThemeData(
      labelColor: p.primaryDark,
      unselectedLabelColor: p.textSecondary,
      indicatorColor: p.primary,
      dividerColor: p.border,
      labelStyle: textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
      unselectedLabelStyle: textTheme.titleSmall,
    ),
  );
}
