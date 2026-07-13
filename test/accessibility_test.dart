import 'dart:ui' show SemanticsAction;

import 'package:claimhelper/core/theme.dart';
import 'package:claimhelper/features/guided/guided_questions_screen.dart';
import 'package:claimhelper/features/preview/purchase_success_screen.dart';
import 'package:claimhelper/features/upload/upload_screen.dart';
import 'package:claimhelper/models/appeal_case.dart';
import 'package:claimhelper/services/mock_backend.dart';
import 'package:claimhelper/state/providers.dart';
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

  test('interactive control boundaries meet WCAG non-text contrast', () {
    expect(_contrast(AppColors.controlBorder, AppColors.surface),
        greaterThanOrEqualTo(3));
    expect(_contrast(AppColors.controlBorder, AppColors.background),
        greaterThanOrEqualTo(3));
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

  testWidgets('repeated navigation has a keyboard skip link and page title',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: buildAppTheme(),
      home: AppScaffold(
        title: 'Accessible test page',
        child: Center(
          child: FilledButton(
            onPressed: () {},
            child: const Text('Main action'),
          ),
        ),
      ),
    ));

    final titles = tester.widgetList<Title>(find.byType(Title));
    expect(
      titles.any((title) => title.title == 'Accessible test page | GetMyYes'),
      isTrue,
    );

    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.pump();
    expect(tester.binding.focusManager.primaryFocus?.debugLabel,
        'Skip to main content');

    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pump();
    expect(
        tester.binding.focusManager.primaryFocus?.debugLabel, 'Main content');
  });

  testWidgets('responsive actions stack at 200 percent text zoom',
      (tester) async {
    tester.view.physicalSize = const Size(320, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(MaterialApp(
      theme: buildAppTheme(),
      home: const MediaQuery(
        data: MediaQueryData(textScaler: TextScaler.linear(2)),
        child: Scaffold(
          body: Padding(
            padding: EdgeInsets.all(16),
            child: ResponsiveActions(
              children: [
                OutlinedButton(
                    onPressed: null, child: Text('Attach documents')),
                FilledButton(onPressed: null, child: Text('Update my preview')),
              ],
            ),
          ),
        ),
      ),
    ));

    expect(tester.takeException(), isNull);
    expect(
      tester.getTopLeft(find.text('Update my preview')).dy,
      greaterThan(tester.getTopLeft(find.text('Attach documents')).dy),
    );
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
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(
      find.bySemanticsLabel(
          RegExp(r'Choose (denial documents|files)', caseSensitive: false)),
      findsOneWidget,
    );
    expect(find.text('Choose files'), findsNothing);
    final dropZone = tester
        .getSemantics(find.bySemanticsLabel('Choose denial documents'))
        .getSemanticsData();
    expect(dropZone.flagsCollection.isButton, isTrue);
    expect(dropZone.hasAction(SemanticsAction.tap), isTrue);
    expect(
      tester
          .getSemantics(find.text('Add your documents'))
          .getSemanticsData()
          .flagsCollection
          .isHeader,
      isTrue,
    );
    expect(find.text('Take a photo'), findsOneWidget);
    expect(find.textContaining('20 MB each, 45 MB total'), findsOneWidget);
    expect(find.textContaining('No card is required'), findsOneWidget);
    expect(
        find.text('I consent to secure document processing'), findsOneWidget);
    final primaryAction = tester.getRect(find.text('Read my document'));
    expect(primaryAction.bottom, lessThanOrEqualTo(900));
    expect(primaryAction.top, greaterThanOrEqualTo(0));
    semantics.dispose();
  });

  testWidgets('guided intake reflows and labels option groups at 200 percent',
      (tester) async {
    tester.view.physicalSize = const Size(320, 1200);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final semantics = tester.ensureSemantics();

    await tester.pumpWidget(ProviderScope(
      overrides: [backendProvider.overrideWithValue(_GuidedA11yBackend())],
      child: MaterialApp(
        theme: buildAppTheme(),
        home: const MediaQuery(
          data: MediaQueryData(
            textScaler: TextScaler.linear(2),
            disableAnimations: true,
          ),
          child: GuidedQuestionsScreen(caseId: 'case-1'),
        ),
      ),
    ));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.bySemanticsLabel('Desired outcome'), findsOneWidget);
    // The relationship question is optional when extraction already identified
    // the patient. Expand the optional section and verify its group label still
    // survives 200% text sizing.
    final optionalDetails = find.text('Add more packet detail (optional)');
    expect(optionalDetails, findsOneWidget);
    await tester.ensureVisible(optionalDetails);
    await tester.pumpAndSettle();
    await tester.tap(optionalDetails);
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('Who is this denial for?'), findsWidgets);
    semantics.dispose();
  });

  testWidgets('purchase progress reflows at 200 percent text zoom',
      (tester) async {
    tester.view.physicalSize = const Size(320, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(ProviderScope(
      overrides: [backendProvider.overrideWithValue(MockBackend())],
      child: MaterialApp(
        theme: buildAppTheme(),
        home: const MediaQuery(
          data: MediaQueryData(
            textScaler: TextScaler.linear(2),
            disableAnimations: true,
          ),
          child: PurchaseSuccessScreen(caseId: 'missing-case'),
        ),
      ),
    ));
    await tester.pump();

    expect(tester.takeException(), isNull);
    expect(find.textContaining('Loading'), findsWidgets);
  });
}

class _GuidedA11yBackend extends MockBackend {
  @override
  Future<AppealCase?> getCase(String caseId) async => AppealCase.fromJson(
        caseId,
        const {
          'status': 'extracted',
          'extraction': {
            'documentType': 'denial_letter',
            'denialCategory': 'unknown',
            'patientName': 'Jordan Sample',
          },
        },
      );
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
