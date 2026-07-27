import 'package:claimhelper/features/guided/guided_questions_screen.dart';
import 'package:claimhelper/models/appeal_case.dart';
import 'package:claimhelper/models/extraction.dart';
import 'package:claimhelper/models/guided_answers.dart';
import 'package:claimhelper/services/mock_backend.dart';
import 'package:claimhelper/state/providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets(
      'preview navigation waits for guided answers to sync and permits retry',
      (tester) async {
    final backend = _FailingGuidedSaveBackend();
    final semantics = tester.ensureSemantics();

    await tester.pumpWidget(
      ProviderScope(
        overrides: [backendProvider.overrideWithValue(backend)],
        child: MaterialApp(
          theme: ThemeData(useMaterial3: true),
          home: const GuidedQuestionsScreen(caseId: 'case-sync'),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final continueButton =
        find.widgetWithText(FilledButton, 'See my free preview');
    await tester.ensureVisible(continueButton);
    await tester.pumpAndSettle();
    await tester.tap(continueButton);
    await tester.pump();
    expect(find.text('Syncing answers…'), findsOneWidget);

    await tester.pumpAndSettle();
    expect(backend.saveAttempts, 1);
    expect(find.byType(GuidedQuestionsScreen), findsOneWidget);
    expect(find.textContaining('still on this page'), findsOneWidget);
    expect(
      tester.widgetList<Semantics>(find.byType(Semantics)).any((node) =>
          node.properties.liveRegion == true &&
          (node.properties.label ?? '').contains('still on this page')),
      isTrue,
    );
    expect(
      tester
          .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'See my free preview'))
          .onPressed,
      isNotNull,
    );

    semantics.dispose();
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(milliseconds: 25));
  });
}

class _FailingGuidedSaveBackend extends MockBackend {
  int saveAttempts = 0;

  @override
  Future<AppealCase?> getCase(String caseId) async => AppealCase(
        id: caseId,
        ownerUid: 'test-user',
        status: CaseStatus.extracted,
        createdAt: DateTime(2026, 1, 1),
        updatedAt: DateTime(2026, 1, 1),
        extraction: const DenialExtraction(
          documentType: DocumentType.denialLetter,
          denialCategory: DenialCategory.duplicateClaim,
          patientName: 'Jordan Sample',
          planName: 'Sample PPO',
          sourceSnippets: [
            SourceSnippet(field: 'patientName', snippet: 'Jordan Sample'),
            SourceSnippet(field: 'planName', snippet: 'Sample PPO'),
          ],
        ),
        guidedAnswers: const GuidedAnswers(
          usState: 'CA',
          desiredOutcome: DesiredOutcome.payBill,
        ),
      );

  @override
  Future<void> saveGuidedAnswers(String caseId, GuidedAnswers answers) async {
    saveAttempts += 1;
    await Future<void>.delayed(const Duration(milliseconds: 20));
    throw StateError('offline');
  }
}
