import 'package:claimhelper/models/guided_answers.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('GuidedAnswers.validate', () {
    GuidedAnswers complete() => const GuidedAnswers(
          relation: PatientRelation.self,
          usState: 'CA',
          insuranceType: InsuranceType.employer,
          desiredOutcome: DesiredOutcome.approveTreatment,
          isUrgent: false,
          contactedInsurer: false,
        );

    test('a complete set of answers is valid', () {
      expect(complete().validate(), isEmpty);
      expect(complete().isComplete, isTrue);
    });

    test('missing required fields are reported', () {
      const empty = GuidedAnswers();
      final problems = empty.validate();
      expect(problems, isNotEmpty);
      expect(empty.isComplete, isFalse);
      // relation, state, insurance type, outcome = 4 core problems
      expect(problems.length, greaterThanOrEqualTo(4));
    });

    test('urgent without an explanation is invalid', () {
      final a = complete().copyWith(isUrgent: true, urgencyNote: '   ');
      expect(a.validate(),
          contains('Briefly describe why a delay is harmful.'));
    });

    test('urgent with an explanation is valid', () {
      final a = complete()
          .copyWith(isUrgent: true, urgencyNote: 'Symptoms worsening weekly.');
      expect(a.isComplete, isTrue);
    });

    test('contacted insurer without notes is invalid', () {
      final a = complete().copyWith(contactedInsurer: true, contactNotes: '');
      expect(a.validate().any((p) => p.contains('reference numbers')), isTrue);
    });

    test('a tried alternative with an empty name is invalid', () {
      final a = complete().copyWith(
        triedAlternatives: const [TriedAlternative(name: '', outcome: 'failed')],
      );
      expect(a.validate().any((p) => p.contains('needs a name')), isTrue);
    });

    test('serialization round-trips enums and sets', () {
      final a = complete().copyWith(
        documentsOnHand: {
          SupportingDocument.denialLetter,
          SupportingDocument.doctorLetter,
        },
        triedAlternatives: const [
          TriedAlternative(name: 'Metformin', outcome: 'not_tolerated'),
        ],
      );
      final restored = GuidedAnswers.fromJson(a.toJson());
      expect(restored.relation, PatientRelation.self);
      expect(restored.insuranceType, InsuranceType.employer);
      expect(restored.documentsOnHand, contains(SupportingDocument.doctorLetter));
      expect(restored.triedAlternatives.single.name, 'Metformin');
      expect(restored.triedAlternatives.single.outcome, 'not_tolerated');
    });
  });
}
