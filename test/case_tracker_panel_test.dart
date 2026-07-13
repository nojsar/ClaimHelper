import 'package:claimhelper/features/packet/case_tracker_panel.dart';
import 'package:claimhelper/models/appeal_case.dart';
import 'package:claimhelper/models/case_tracker.dart';
import 'package:claimhelper/services/mock_backend.dart';
import 'package:claimhelper/state/providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class _TrackingBackend extends MockBackend {
  String? updatedCaseId;
  CaseTracker? updatedTracker;

  @override
  Future<bool> updateCaseTracker(String caseId, CaseTracker tracker) async {
    updatedCaseId = caseId;
    updatedTracker = tracker;
    return false;
  }
}

AppealCase _case({CaseTracker? tracker}) => AppealCase(
      id: 'case-123',
      status: CaseStatus.generated,
      paid: true,
      caseTracker: tracker,
    );

Widget _app(_TrackingBackend backend, AppealCase appealCase) => ProviderScope(
      overrides: [backendProvider.overrideWithValue(backend)],
      child: MaterialApp(
        home: Scaffold(body: CaseTrackerPanel(appealCase: appealCase)),
      ),
    );

void main() {
  testWidgets('denied outcome exposes accessible external-review guidance',
      (tester) async {
    final tracker = CaseTracker(
      submittedDate: DateTime(2026, 7, 1),
      submissionMethod: SubmissionMethod.onlinePortal,
      responseStatus: InsurerResponseStatus.decisionReceived,
      outcome: AppealOutcome.denied,
    );
    await tester.pumpWidget(_app(_TrackingBackend(), _case(tracker: tracker)));
    await tester.pumpAndSettle();

    expect(find.text('Track your submitted appeal'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Review external-review options'),
      350,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Review external-review options'), findsOneWidget);
    expect(find.bySemanticsLabel('Review external-review options'),
        findsOneWidget);
  });

  testWidgets('saving sends only the bounded tracker model and case id',
      (tester) async {
    final backend = _TrackingBackend();
    await tester.pumpWidget(_app(backend, _case()));
    await tester.pumpAndSettle();

    final save = find.widgetWithText(FilledButton, 'Save case tracker');
    await tester.scrollUntilVisible(
      save,
      350,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(save);
    await tester.pumpAndSettle();

    expect(backend.updatedCaseId, 'case-123');
    expect(backend.updatedTracker, isNotNull);
    expect(backend.updatedTracker!.outcome, AppealOutcome.pending);
    expect(backend.updatedTracker!.submissionMethod,
        SubmissionMethod.onlinePortal);
    expect(find.text('Case tracker saved.'), findsOneWidget);
  });
}
