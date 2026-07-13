import 'package:claimhelper/models/appeal_case.dart';
import 'package:claimhelper/models/case_tracker.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('case tracker round-trips bounded fields through AppealCase', () {
    final tracker = CaseTracker(
      submittedDate: DateTime(2026, 7, 10),
      submissionMethod: SubmissionMethod.certifiedMail,
      confirmationNumber: 'REF-123',
      expectedResponseDate: DateTime(2026, 8, 10),
      responseDate: DateTime(2026, 8, 1),
      responseStatus: InsurerResponseStatus.decisionReceived,
      outcome: AppealOutcome.partiallyApproved,
      responseReminderEnabled: true,
    );
    final appealCase = AppealCase.fromJson('case-1', {
      'status': 'generated',
      'paid': true,
      'caseTracker': tracker.toJson(),
    });

    expect(appealCase.caseTracker, isNotNull);
    expect(appealCase.caseTracker!.submissionMethod,
        SubmissionMethod.certifiedMail);
    expect(appealCase.caseTracker!.responseStatus,
        InsurerResponseStatus.decisionReceived);
    expect(appealCase.caseTracker!.outcome, AppealOutcome.partiallyApproved);
    expect(appealCase.caseTracker!.confirmationNumber, 'REF-123');
    expect(appealCase.caseTracker!.expectedResponseDate, DateTime(2026, 8, 10));
    expect(appealCase.caseTracker!.toJson()['submittedDate'], '2026-07-10');
  });

  test('unknown server enum values fall back to safe pending defaults', () {
    final tracker = CaseTracker.fromJson({
      'submittedDate': '2026-07-10',
      'submissionMethod': 'unknown',
      'responseStatus': 'unknown',
      'outcome': 'unknown',
    });

    expect(tracker.submissionMethod, SubmissionMethod.onlinePortal);
    expect(tracker.responseStatus, InsurerResponseStatus.noResponseYet);
    expect(tracker.outcome, AppealOutcome.pending);
  });
}
