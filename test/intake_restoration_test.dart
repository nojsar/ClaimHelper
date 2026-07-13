import 'dart:typed_data';

import 'package:claimhelper/models/appeal_case.dart';
import 'package:claimhelper/models/guided_answers.dart';
import 'package:claimhelper/services/backend.dart';
import 'package:claimhelper/services/mock_backend.dart';
import 'package:claimhelper/state/intake_controller.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('restores extraction and guided draft from the durable case', () async {
    final backend = MockBackend();
    final session =
        await backend.createCaseUploadSession(consentConfirmed: true);
    final paths = await backend.uploadSourceFiles(session, [
      PickedUpload(
        name: 'denial.pdf',
        bytes: Uint8List.fromList([1, 2, 3]),
        mimeType: 'application/pdf',
      ),
    ]);
    final extraction = await backend.extractDenial(session.caseId, paths);
    const answers = GuidedAnswers(
      usState: 'CA',
      desiredOutcome: DesiredOutcome.approveTreatment,
      isUrgent: false,
    );
    await backend.saveGuidedAnswers(session.caseId, answers);

    final controller = IntakeController(backend);
    final restored = await controller.restoreCase(session.caseId);

    expect(restored, isNotNull);
    expect(controller.state.caseId, session.caseId);
    expect(controller.state.extraction?.deniedItem, extraction.deniedItem);
    expect(controller.state.guidedAnswers.usState, 'CA');
    expect(controller.state.guidedAnswers.desiredOutcome,
        DesiredOutcome.approveTreatment);
    expect(controller.state.restoring, isFalse);
  });

  test('understands the durable extracting status', () {
    final appealCase = AppealCase.fromJson('case-1', const {
      'status': 'extracting',
    });
    expect(appealCase.status, CaseStatus.extracting);
  });
}
