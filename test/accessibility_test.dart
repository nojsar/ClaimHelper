import 'dart:ui' show SemanticsAction;

import 'package:claimhelper/core/theme.dart';
import 'package:claimhelper/features/upload/upload_screen.dart';
import 'package:claimhelper/widgets/app_scaffold.dart';
import 'package:claimhelper/widgets/case_loader.dart';
import 'package:claimhelper/widgets/ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('normal-size muted and accent text colors meet WCAG AA contrast', () {
    expect(_contrast(AppColors.textMuted, AppColors.background),
        greaterThanOrEqualTo(4.5));
    expect(_contrast(AppColors.textMuted, AppColors.surface),
        greaterThanOrEqualTo(4.5));
    expect(_contrast(AppColors.accentBright, AppColors.accentTint),
        greaterThanOrEqualTo(4.5));
  });

  testWidgets('errors are exposed as live status messages', (tester) async {
    final semantics = tester.ensureSemantics();

    await tester.pumpWidget(MaterialApp(
      theme: buildAppTheme(),
      home: ErrorRetry(message: 'Could not load the case.', onRetry: () {}),
    ));

    final liveRegions = tester
        .widgetList<Semantics>(find.byType(Semantics))
        .where((widget) => widget.properties.liveRegion == true)
        .toList();
    expect(liveRegions, isNotEmpty);
    expect(liveRegions.any((widget) => widget.properties.label == 'Error'),
        isTrue);
    final retry =
        tester.getSemantics(find.text('Try again')).getSemanticsData();
    expect(retry.hasAction(SemanticsAction.tap), isTrue);
    semantics.dispose();
  });

  testWidgets('reduced motion disables entrance and loader cycling',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: buildAppTheme(),
      home: MediaQuery(
        data: const MediaQueryData(disableAnimations: true),
        child: AppScaffold(
          showChrome: false,
          title: 'Processing',
          child: const CaseLoader(messages: ['First status', 'Second status']),
        ),
      ),
    ));

    expect(find.byType(TweenAnimationBuilder<double>), findsNothing);
    expect(find.text('First status'), findsOneWidget);
    await tester.pump(const Duration(seconds: 4));
    expect(find.text('First status'), findsOneWidget);
    expect(find.text('Second status'), findsNothing);
  });

  testWidgets('interactive cards can be activated from the keyboard',
      (tester) async {
    var activations = 0;
    await tester.pumpWidget(MaterialApp(
      theme: buildAppTheme(),
      home: Scaffold(
        body: HoverCard(
          onTap: () => activations++,
          child: const Text('Open details'),
        ),
      ),
    ));

    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pump();
    expect(activations, 1);
  });

  testWidgets('upload flow reflows at 200 percent text scaling',
      (tester) async {
    tester.view.physicalSize = const Size(320, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final semantics = tester.ensureSemantics();

    await tester.pumpWidget(ProviderScope(
      child: MaterialApp(
        theme: buildAppTheme(),
        home: const MediaQuery(
          data: MediaQueryData(
            textScaler: TextScaler.linear(2),
            disableAnimations: true,
          ),
          child: UploadScreen(),
        ),
      ),
    ));
    await tester.pump();

    expect(tester.takeException(), isNull);
    final dropZone = tester
        .getSemantics(find.bySemanticsLabel('Choose denial documents'))
        .getSemanticsData();
    expect(dropZone.flagsCollection.isButton, isTrue);
    expect(dropZone.hasAction(SemanticsAction.tap), isTrue);
    semantics.dispose();
  });
}

double _contrast(Color foreground, Color background) {
  final lighter = foreground.computeLuminance() > background.computeLuminance()
      ? foreground.computeLuminance()
      : background.computeLuminance();
  final darker = foreground.computeLuminance() > background.computeLuminance()
      ? background.computeLuminance()
      : foreground.computeLuminance();
  return (lighter + 0.05) / (darker + 0.05);
}
