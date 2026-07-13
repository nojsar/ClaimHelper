import 'package:claimhelper/models/appeal_case.dart';
import 'package:claimhelper/models/extraction.dart';
import 'package:claimhelper/models/guided_answers.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const extraction = DenialExtraction(
    documentType: DocumentType.priorAuthorization,
    denialCategory: DenialCategory.stepTherapy,
    deniedItem: 'Wegovy',
  );

  const completeAnswers = GuidedAnswers(
    relation: PatientRelation.self,
    usState: 'CA',
    insuranceType: InsuranceType.employer,
    desiredOutcome: DesiredOutcome.approveTreatment,
    isUrgent: false,
    contactedInsurer: false,
  );

  AppealCase base({
    bool paid = false,
    DenialExtraction? ex,
    GuidedAnswers? answers,
  }) =>
      AppealCase(
        id: 'c1',
        status: CaseStatus.extracted,
        paid: paid,
        extraction: ex,
        guidedAnswers: answers,
      );

  group('Entitlement.canViewFullPacket', () {
    test('false until paid', () {
      expect(Entitlement.canViewFullPacket(base(paid: false)), isFalse);
    });
    test('true once paid', () {
      expect(Entitlement.canViewFullPacket(base(paid: true)), isTrue);
    });
  });

  group('Entitlement.canGeneratePreview', () {
    test('requires extraction only', () {
      expect(Entitlement.canGeneratePreview(base(ex: null)), isFalse);
      expect(Entitlement.canGeneratePreview(base(ex: extraction)), isTrue);
    });
  });

  group('Entitlement.canPurchase', () {
    test('offered when unpaid with an extraction', () {
      expect(Entitlement.canPurchase(base(ex: extraction)), isTrue);
    });
    test('not offered once paid', () {
      expect(
          Entitlement.canPurchase(base(paid: true, ex: extraction)), isFalse);
    });
    test('not offered without an extraction', () {
      expect(Entitlement.canPurchase(base(ex: null)), isFalse);
    });
  });

  group('Entitlement.canGeneratePacket', () {
    test('needs paid + extraction + complete answers', () {
      // Unpaid → no.
      expect(
        Entitlement.canGeneratePacket(
            base(paid: false, ex: extraction, answers: completeAnswers)),
        isFalse,
      );
      // Paid but incomplete answers → no.
      expect(
        Entitlement.canGeneratePacket(
            base(paid: true, ex: extraction, answers: const GuidedAnswers())),
        isFalse,
      );
      // Paid, extraction, complete answers → yes.
      expect(
        Entitlement.canGeneratePacket(
            base(paid: true, ex: extraction, answers: completeAnswers)),
        isTrue,
      );
      // Paid, complete answers, but no extraction → no.
      expect(
        Entitlement.canGeneratePacket(
            base(paid: true, ex: null, answers: completeAnswers)),
        isFalse,
      );
    });
  });
}
