import 'package:claimhelper/features/account/account_screen.dart';
import 'package:claimhelper/models/appeal_case.dart';
import 'package:claimhelper/models/extraction.dart';
import 'package:claimhelper/models/packet.dart';
import 'package:flutter_test/flutter_test.dart';

AppealCase _case({
  required String id,
  required CaseStatus status,
  bool paid = false,
  DenialExtraction? extraction,
  FreePreview? preview,
}) {
  return AppealCase(
    id: id,
    status: status,
    paid: paid,
    extraction: extraction,
    preview: preview,
  );
}

void main() {
  test('failed and incomplete saved cases resume through processing', () {
    final failed = _case(id: 'failed', status: CaseStatus.error);
    final extracting = _case(id: 'reading', status: CaseStatus.extracting);

    expect(caseResumeRoute(failed), '/case/failed/processing');
    expect(caseResumeAction(failed), 'Retry reading');
    expect(
        caseResumeStatus(failed), 'Needs attention — retry document reading');
    expect(caseResumeRoute(extracting), '/case/reading/processing');
  });

  test('saved cases resume from their furthest durable milestone', () {
    final reviewed = _case(
      id: 'review',
      status: CaseStatus.extracted,
      extraction: const DenialExtraction(
        documentType: DocumentType.denialLetter,
        denialCategory: DenialCategory.unknown,
      ),
    );
    final preview = _case(
      id: 'preview',
      status: CaseStatus.preview,
      preview: const FreePreview(
        denialSummary: 'Summary',
        amountAtStake: null,
        likelyAppealPath: 'Path',
        missingInfo: [],
        recommendedPacketType: 'Packet',
      ),
    );
    final paid = _case(id: 'paid', status: CaseStatus.paid, paid: true);

    expect(caseResumeRoute(reviewed), '/case/review/review');
    expect(caseResumeAction(reviewed), 'Review details');
    expect(caseResumeRoute(preview), '/case/preview/preview');
    expect(caseResumeAction(preview), 'Open preview');
    expect(caseResumeRoute(paid), '/case/paid/purchase-success');
    expect(caseResumeAction(paid), 'Check packet status');
  });
}
