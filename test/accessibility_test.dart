import 'dart:async';
import 'dart:ui' show SemanticsAction, Tristate;

import 'package:claimhelper/core/constants.dart';
import 'package:claimhelper/core/theme.dart';
import 'package:claimhelper/features/account/account_screen.dart';
import 'package:claimhelper/features/admin/stats_screen.dart';
import 'package:claimhelper/features/extraction/extraction_review_screen.dart';
import 'package:claimhelper/features/guided/guided_questions_screen.dart';
import 'package:claimhelper/features/packet/appeal_packet_screen.dart';
import 'package:claimhelper/features/preview/preview_paywall_screen.dart';
import 'package:claimhelper/features/preview/purchase_success_screen.dart';
import 'package:claimhelper/features/settings/settings_screen.dart';
import 'package:claimhelper/features/upload/upload_screen.dart';
import 'package:claimhelper/models/appeal_case.dart';
import 'package:claimhelper/models/case_tracker.dart';
import 'package:claimhelper/models/extraction.dart';
import 'package:claimhelper/models/packet.dart';
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

  testWidgets('extraction review keeps headings and fields accessible at 200%',
      (tester) async {
    _useNarrowLargeTextViewport(tester, height: 2200);
    final semantics = tester.ensureSemantics();

    await tester.pumpWidget(_workflowApp(
      backend: _WorkflowA11yBackend(reviewCase: _reviewCase),
      child: const ExtractionReviewScreen(caseId: 'case-a11y'),
    ));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(
      tester
          .getSemantics(find.text('Check the details'))
          .getSemanticsData()
          .flagsCollection
          .isHeader,
      isTrue,
    );
    expect(
      find.bySemanticsLabel(RegExp(r'Insurance company', caseSensitive: false)),
      findsOneWidget,
    );
    expect(
      find.bySemanticsLabel(RegExp(r'Denial reason', caseSensitive: false)),
      findsOneWidget,
    );
    final continueAction = tester
        .getSemantics(find.textContaining('Looks right'))
        .getSemanticsData();
    expect(continueAction.hasAction(SemanticsAction.tap), isTrue);
    semantics.dispose();
  });

  testWidgets('preview tiers and reminder form remain operable at 200%',
      (tester) async {
    _useNarrowLargeTextViewport(tester, height: 4200);
    final semantics = tester.ensureSemantics();

    await tester.pumpWidget(_workflowApp(
      backend: _WorkflowA11yBackend(reviewCase: _previewCase),
      child: const PreviewPaywallScreen(caseId: 'case-a11y'),
    ));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(
      tester
          .getSemantics(find.text('Your free preview').last)
          .getSemanticsData()
          .flagsCollection
          .isHeader,
      isTrue,
    );
    final packetTier = tester
        .getSemantics(find.bySemanticsLabel(r'Full Appeal Packet, $39'))
        .getSemanticsData();
    expect(packetTier.flagsCollection.isButton, isTrue);
    expect(packetTier.flagsCollection.isSelected, Tristate.isTrue);
    expect(packetTier.hasAction(SemanticsAction.tap), isTrue);
    expect(
      find.bySemanticsLabel(
          RegExp(r'Reminder email address', caseSensitive: false)),
      findsOneWidget,
    );
    semantics.dispose();
  });

  testWidgets('account validation error is announced at 200% text zoom',
      (tester) async {
    _useNarrowLargeTextViewport(tester, height: 1800);
    final semantics = tester.ensureSemantics();

    await tester.pumpWidget(_workflowApp(
      backend: _WorkflowA11yBackend(),
      child: const AccountScreen(),
    ));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(
      tester
          .getSemantics(find.text('Create an account to save cases'))
          .getSemanticsData()
          .flagsCollection
          .isHeader,
      isTrue,
    );
    expect(find.bySemanticsLabel('Email'), findsOneWidget);
    expect(find.bySemanticsLabel('Password (6+ characters)'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Create account'));
    await tester.pump();

    final liveErrors = tester
        .widgetList<Semantics>(find.byType(Semantics))
        .where((widget) =>
            widget.properties.liveRegion == true &&
            (widget.properties.label ?? '').startsWith('Error:'));
    expect(liveErrors, isNotEmpty);
    expect(tester.takeException(), isNull);
    semantics.dispose();
  });

  testWidgets('settings confirmation stays readable and keyboard actionable',
      (tester) async {
    _useNarrowLargeTextViewport(tester, height: 1800);
    final semantics = tester.ensureSemantics();

    await tester.pumpWidget(_workflowApp(
      backend: _WorkflowA11yBackend(),
      child: const SettingsScreen(),
    ));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(
      tester
          .getSemantics(find.text('Your data'))
          .getSemanticsData()
          .flagsCollection
          .isHeader,
      isTrue,
    );
    await tester.tap(find.widgetWithText(ListTile, 'Delete all data'));
    await tester.pumpAndSettle();
    expect(find.text('Delete all your data?'), findsOneWidget);
    final destructiveAction =
        tester.getSemantics(find.text('Delete everything')).getSemanticsData();
    expect(destructiveAction.hasAction(SemanticsAction.tap), isTrue);
    expect(tester.takeException(), isNull);
    semantics.dispose();
  });

  testWidgets('packet tabs expose the integrated case tracker at 200%',
      (tester) async {
    _useNarrowLargeTextViewport(tester, height: 1400);
    final semantics = tester.ensureSemantics();

    await tester.pumpWidget(_workflowApp(
      backend: _WorkflowA11yBackend(reviewCase: _packetCase),
      child: const AppealPacketScreen(caseId: 'case-a11y'),
    ));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(
      tester
          .getSemantics(find.text('Plain-English summary'))
          .getSemanticsData()
          .flagsCollection
          .isHeader,
      isTrue,
    );
    await tester.ensureVisible(find.text('Case tracker'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Case tracker'));
    await tester.pumpAndSettle();
    expect(
      tester
          .getSemantics(find.text('Track your submitted appeal'))
          .getSemanticsData()
          .flagsCollection
          .isHeader,
      isTrue,
    );
    final submittedDate = tester
        .getSemantics(find.bySemanticsLabel(
            RegExp(r'^Submitted date, .*required$', caseSensitive: false)))
        .getSemanticsData();
    expect(submittedDate.flagsCollection.isButton, isTrue);
    expect(submittedDate.hasAction(SemanticsAction.tap), isTrue);
    expect(tester.takeException(), isNull);
    semantics.dispose();
  });

  testWidgets('stats demo fallback reflows at 200% text zoom', (tester) async {
    _useNarrowLargeTextViewport(tester, height: 900);

    await tester.pumpWidget(MaterialApp(
      theme: buildAppTheme(),
      home: const MediaQuery(
        data: MediaQueryData(
          textScaler: TextScaler.linear(2),
          disableAnimations: true,
        ),
        child: StatsScreen(),
      ),
    ));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.text('Stats are unavailable in demo mode.'), findsOneWidget);
  }, skip: !kUseMocks);
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

class _WorkflowA11yBackend extends MockBackend {
  _WorkflowA11yBackend({this.reviewCase});

  final AppealCase? reviewCase;

  @override
  Future<AppealCase?> getCase(String caseId) async => reviewCase;

  @override
  Stream<AppealCase?> watchCase(String caseId) => Stream.value(reviewCase);

  @override
  Future<List<AppealCase>> listMyCases() async => const [];
}

void _useNarrowLargeTextViewport(WidgetTester tester,
    {required double height}) {
  tester.view.physicalSize = Size(320, height);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

Widget _workflowApp({
  required MockBackend backend,
  required Widget child,
}) =>
    ProviderScope(
      overrides: [backendProvider.overrideWithValue(backend)],
      child: MaterialApp(
        theme: buildAppTheme(),
        home: MediaQuery(
          data: const MediaQueryData(
            textScaler: TextScaler.linear(2),
            disableAnimations: true,
          ),
          child: child,
        ),
      ),
    );

const _extraction = DenialExtraction(
  documentType: DocumentType.denialLetter,
  denialCategory: DenialCategory.notMedicallyNecessary,
  insurerName: 'Sample Health Plan',
  patientName: 'Jordan Sample',
  claimNumber: 'CLM-12345',
  appealDeadline: '2026-08-31',
  deniedItem: 'Physical therapy',
  providerName: 'Sample Clinic',
  denialReasonText: 'The service was not medically necessary.',
  patientResponsibility: 1200,
  sourceSnippets: [
    SourceSnippet(field: 'insurerName', snippet: 'Sample Health Plan'),
    SourceSnippet(field: 'claimNumber', snippet: 'CLM-12345'),
    SourceSnippet(field: 'deniedItem', snippet: 'Physical therapy'),
    SourceSnippet(field: 'providerName', snippet: 'Sample Clinic'),
    SourceSnippet(field: 'appealDeadline', snippet: 'August 31, 2026'),
    SourceSnippet(
      field: 'denialReasonText',
      snippet: 'not medically necessary',
    ),
  ],
);

final _reviewCase = AppealCase(
  id: 'case-a11y',
  status: CaseStatus.extracted,
  extraction: _extraction,
);

final _previewCase = AppealCase(
  id: 'case-a11y',
  status: CaseStatus.preview,
  extraction: _extraction,
  preview: const FreePreview(
    denialSummary: 'The insurer denied physical therapy.',
    amountAtStake: r'$1,200 at stake',
    likelyAppealPath: 'Submit an internal medical-necessity appeal.',
    missingInfo: ['A clinician statement'],
    recommendedPacketType: 'Medical-necessity appeal packet',
    letterOpening: 'Dear Appeals Department: I am appealing this denial.',
  ),
);

final _packetCase = AppealCase(
  id: 'case-a11y',
  status: CaseStatus.generated,
  paid: true,
  extraction: _extraction,
  packet: const AppealPacket(
    plainEnglishSummary: 'The insurer denied physical therapy.',
    appealStrategy: 'Submit an internal medical-necessity appeal.',
    appealLetter: 'Dear Appeals Department: Please reconsider this denial.',
    doctorLetterRequest: 'Please provide a supporting clinical statement.',
    insurerCallScript: 'Please confirm receipt and the review deadline.',
    warnings: ['Confirm every deadline directly with the insurer.'],
    disclaimer: 'Drafting help only. Review before sending.',
  ),
  caseTracker: CaseTracker(
    submittedDate: DateTime(2026, 7, 1),
    submissionMethod: SubmissionMethod.onlinePortal,
    responseStatus: InsurerResponseStatus.noResponseYet,
    outcome: AppealOutcome.pending,
  ),
);

double _contrast(Color foreground, Color background) {
  final lighter = foreground.computeLuminance() > background.computeLuminance()
      ? foreground.computeLuminance()
      : background.computeLuminance();
  final darker = foreground.computeLuminance() > background.computeLuminance()
      ? background.computeLuminance()
      : foreground.computeLuminance();
  return (lighter + 0.05) / (darker + 0.05);
}
