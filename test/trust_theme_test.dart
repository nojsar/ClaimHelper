import 'package:claimhelper/core/theme.dart';
import 'package:claimhelper/widgets/ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('brand colors stay calm and separate from destructive red', () {
    expect(AppColors.primary, isNot(AppColors.error));
    expect(AppColors.accent, isNot(AppColors.error));
    expect(AppGradients.brand.colors, [AppColors.primary, AppColors.accent]);
    expect(_contrast(AppColors.primary, AppColors.background),
        greaterThanOrEqualTo(4.5));
    expect(_contrast(AppColors.accentBright, AppColors.background),
        greaterThanOrEqualTo(4.5));
  });

  test('theme preserves readable copy and large controls', () {
    final theme = buildAppTheme();
    expect(theme.textTheme.bodyLarge?.fontSize, 18);
    expect(theme.textTheme.bodyMedium?.fontSize, 16);
    expect(theme.textTheme.labelLarge?.fontSize, 16);

    final filledSize =
        theme.filledButtonTheme.style?.minimumSize?.resolve(<WidgetState>{});
    final outlinedSize =
        theme.outlinedButtonTheme.style?.minimumSize?.resolve(<WidgetState>{});
    final textSize =
        theme.textButtonTheme.style?.minimumSize?.resolve(<WidgetState>{});
    expect(filledSize?.height, greaterThanOrEqualTo(52));
    expect(outlinedSize?.height, greaterThanOrEqualTo(52));
    expect(textSize?.height, greaterThanOrEqualTo(48));
  });

  for (final (name, p) in [
    ('light', AppPalette.light),
    ('dark', AppPalette.dark),
  ]) {
    test('$name palette keeps text at WCAG AA on every surface', () {
      final text = {
        'textPrimary': p.textPrimary,
        'textSecondary': p.textSecondary,
        'textMuted': p.textMuted,
        'primary': p.primary,
        'primaryDark': p.primaryDark,
        'accent': p.accent,
        'accentBright': p.accentBright,
      };
      final surfaces = {
        'background': p.background,
        'surface': p.surface,
        'surfaceAlt': p.surfaceAlt,
        'primaryTint': p.primaryTint,
        'accentTint': p.accentTint,
      };
      for (final t in text.entries) {
        for (final s in surfaces.entries) {
          expect(_contrast(t.value, s.value), greaterThanOrEqualTo(4.5),
              reason: '${t.key} on ${s.key}');
        }
      }
      for (final s in [p.surface, p.background]) {
        expect(_contrast(p.warning, s), greaterThanOrEqualTo(4.5));
        expect(_contrast(p.error, s), greaterThanOrEqualTo(4.5));
        expect(_contrast(p.controlBorder, s), greaterThanOrEqualTo(3));
      }
      expect(_contrast(p.warning, p.warningTint), greaterThanOrEqualTo(4.5));
      expect(_contrast(p.error, p.errorTint), greaterThanOrEqualTo(4.5));
      expect(_contrast(p.onInk, p.ink), greaterThanOrEqualTo(4.5));
      expect(_contrast(p.onInk, p.inkSoft), greaterThanOrEqualTo(4.5));
      expect(_contrast(p.onError, p.error), greaterThanOrEqualTo(4.5));
      expect(_contrast(Colors.white, p.panel), greaterThanOrEqualTo(4.5));
      expect(_contrast(AppColors.primaryDark, p.panelAction),
          greaterThanOrEqualTo(4.5));
      for (final c in p.brandGradient.colors) {
        expect(_contrast(Colors.white, c), greaterThanOrEqualTo(4.5));
      }
      for (final c in p.ctaGradient.colors) {
        expect(_contrast(Colors.white, c), greaterThanOrEqualTo(4.5));
      }
      for (final c in p.accentTextGradient.colors) {
        expect(_contrast(c, p.background), greaterThanOrEqualTo(4.5));
      }
    });
  }

  test('dark theme carries the dark palette and the same large controls', () {
    final theme = buildAppTheme(brightness: Brightness.dark);
    expect(theme.brightness, Brightness.dark);
    expect(theme.extension<AppPalette>(), same(AppPalette.dark));
    expect(theme.scaffoldBackgroundColor, const Color(0xFF0E1922));
    expect(theme.textTheme.bodyLarge?.fontSize, 18);
    expect(
      theme.filledButtonTheme.style?.minimumSize?.resolve(<WidgetState>{}),
      const Size(52, 52),
    );
    expect(buildAppTheme().extension<AppPalette>(), same(AppPalette.light));
  });

  testWidgets('screens read the palette for the system appearance',
      (tester) async {
    late AppPalette seen;
    addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
    tester.platformDispatcher.platformBrightnessTestValue = Brightness.dark;
    await tester.pumpWidget(MaterialApp(
      theme: buildAppTheme(),
      darkTheme: buildAppTheme(brightness: Brightness.dark),
      themeMode: ThemeMode.system,
      home: Builder(builder: (context) {
        seen = context.palette;
        return const SizedBox();
      }),
    ));
    await tester.pumpAndSettle();
    expect(seen.background, AppPalette.dark.background);

    // Switching the system setting while the app is open follows along.
    tester.platformDispatcher.platformBrightnessTestValue = Brightness.light;
    await tester.pumpAndSettle();
    expect(seen.background, AppPalette.light.background);
  });

  testWidgets('brand mark communicates completion instead of rejection',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(theme: buildAppTheme(), home: const BrandMark()),
    );

    expect(find.byIcon(Icons.check_rounded), findsOneWidget);
    expect(find.byIcon(Icons.close_rounded), findsNothing);
    expect(find.byIcon(Icons.cancel_rounded), findsNothing);
  });
}

double _contrast(Color foreground, Color background) {
  final foregroundLuminance = foreground.computeLuminance();
  final backgroundLuminance = background.computeLuminance();
  final lighter = foregroundLuminance > backgroundLuminance
      ? foregroundLuminance
      : backgroundLuminance;
  final darker = foregroundLuminance > backgroundLuminance
      ? backgroundLuminance
      : foregroundLuminance;
  return (lighter + 0.05) / (darker + 0.05);
}
