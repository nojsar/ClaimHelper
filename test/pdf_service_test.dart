import 'package:claimhelper/models/appeal_case.dart';
import 'package:claimhelper/models/case_tracker.dart';
import 'package:claimhelper/models/follow_up.dart';
import 'package:claimhelper/models/packet.dart';
import 'package:claimhelper/services/pdf_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const packet = AppealPacket(
    plainEnglishSummary: 'Summary',
    appealStrategy: 'Strategy',
    appealLetter: 'Dear Appeals,\nPlease reverse the denial.',
    doctorLetterRequest: 'Dear Doctor,\nPlease provide supporting records.',
    evidenceChecklist: [
      EvidenceItem(
        item: 'Doctor letter',
        whyNeeded: 'Supports the request',
        status: 'missing',
      ),
    ],
    insurerCallScript: 'Please confirm receipt.',
    deadlineChecklist: [
      DeadlineItem(
        task: 'File appeal',
        dueDate: '2026-08-17',
        priority: 'high',
      ),
    ],
    warnings: ['Confirm the exact deadline.'],
    disclaimer: 'Not legal, medical, or insurance advice.',
  );

  test('full PDF export includes saved tracker and follow-up content',
      () async {
    const baseCase = AppealCase(
      id: 'base-case',
      status: CaseStatus.generated,
      paid: true,
      packet: packet,
    );
    final fullCase = AppealCase(
      id: 'full-case',
      status: CaseStatus.generated,
      paid: true,
      packet: packet,
      caseTracker: CaseTracker(
        submittedDate: DateTime.utc(2026, 7, 1),
        submissionMethod: SubmissionMethod.certifiedMail,
        confirmationNumber: 'CONF-123',
        expectedResponseDate: DateTime.utc(2026, 7, 31),
        responseStatus: InsurerResponseStatus.underReview,
      ),
      followUps: [
        FollowUpRound(
          outcome: 'Denied again',
          situationSummary: 'The first appeal was denied.',
          recommendedNextSteps: 'Request external review.',
          responseLetter: 'Please begin external review.',
          callScript: 'Has external review started?',
          deadlineNotes: 'Submit within 30 days.',
          warnings: const ['Confirm this deadline.'],
          disclaimer: 'Follow-up draft only.',
          createdAt: DateTime.utc(2026, 7, 12),
        ),
      ],
    );

    final service = PdfService();
    final baseBytes =
        await (await service.buildPacketDocument(baseCase)).save();
    final fullBytes =
        await (await service.buildPacketDocument(fullCase)).save();

    expect(baseBytes, isNotEmpty);
    expect(fullBytes, isNotEmpty);
    expect(
      fullBytes.length,
      greaterThan(baseBytes.length + 500),
      reason: 'The full export should contain materially more than the packet.',
    );
  });

  test('PDF export remains valid when submission has not been recorded',
      () async {
    const appealCase = AppealCase(
      id: 'unsubmitted',
      status: CaseStatus.generated,
      paid: true,
      packet: packet,
    );

    final bytes =
        await (await PdfService().buildPacketDocument(appealCase)).save();

    expect(bytes, isNotEmpty);
  });
}
