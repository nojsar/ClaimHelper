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
