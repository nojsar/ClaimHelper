import 'dart:async';

import 'package:claimhelper/core/theme.dart';
import 'package:claimhelper/features/extraction/extraction_review_screen.dart';
import 'package:claimhelper/models/appeal_case.dart';
import 'package:claimhelper/models/extraction.dart';
import 'package:claimhelper/services/mock_backend.dart';
import 'package:claimhelper/state/providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class _ControllableSaveBackend extends MockBackend {
  final save = Completer<void>();
  var saveAttempts = 0;

  @override
  Future<AppealCase?> getCase(String caseId) async => AppealCase(
        id: caseId,
        status: CaseStatus.extracted,
        extraction: _extraction,
      );

  @override
  Future<void> saveExtractionEdits(
    String caseId,
    DenialExtraction extraction,
  ) {
    saveAttempts += 1;
    return save.future;
  }
}

const _extraction = DenialExtraction(
  documentType: DocumentType.denialLetter,
  denialCategory: DenialCategory.notMedicallyNecessary,
  insurerName: 'Sample Health Plan',
  claimNumber: 'CLM-12345',
  deniedItem: 'Physical therapy',
  providerName: 'Sample Clinic',
  appealDeadline: '2026-08-31',
  denialReasonText: 'The service was not medically necessary.',
);

void main() {
  testWidgets(
      'failed extraction save preserves edits, blocks duplicates, and offers retry',
      (tester) async {
    final backend = _ControllableSaveBackend();
    final semantics = tester.ensureSemantics();
    await tester.binding.setSurfaceSize(const Size(1200, 1000));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      ProviderScope(
        overrides: [backendProvider.overrideWithValue(backend)],
        child: MaterialApp(
          theme: buildAppTheme(),
          home: const ExtractionReviewScreen(caseId: 'case-recovery'),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final insurerField = find.bySemanticsLabel(
      RegExp(r'Insurance company', caseSensitive: false),
    );
    await tester.enterText(insurerField, 'Updated Health Plan');
    final continueAction = find.text('Looks right — continue');
    await tester.ensureVisible(continueAction);
    await tester.pumpAndSettle();
    await tester.tap(continueAction);
    await tester.pump();

    expect(backend.saveAttempts, 1);
    expect(find.text('Saving details…'), findsOneWidget);
    expect(
      tester
          .widget<FilledButton>(
            find.widgetWithText(FilledButton, 'Saving details…'),
          )
          .onPressed,
      isNull,
    );

    backend.save.completeError(StateError('offline'));
    await tester.pumpAndSettle();

    const error =
        'We could not save these details. Check your connection and try again.';
    expect(find.text(error), findsOneWidget);
    expect(find.text('Updated Health Plan'), findsOneWidget);
    expect(
      tester
          .widget<FilledButton>(
            find.widgetWithText(FilledButton, 'Looks right — continue'),
          )
          .onPressed,
      isNotNull,
    );

    final liveRegions = tester
        .widgetList<Semantics>(find.byType(Semantics))
        .where((widget) => widget.properties.liveRegion == true);
    expect(
      liveRegions.any((widget) => widget.properties.label == 'Error: $error'),
      isTrue,
    );
    expect(tester.takeException(), isNull);
    semantics.dispose();
  });
}
