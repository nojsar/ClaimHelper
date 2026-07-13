import 'extraction.dart';

/// Answers collected on the Guided Questions screen. Serialized into the
/// case document and fed to packet generation.
enum PatientRelation {
  self('self', 'Myself'),
  child('child', 'My child'),
  caredPerson('cared_person', 'Someone I help care for');

  const PatientRelation(this.wire, this.label);
  final String wire;
  final String label;

  static PatientRelation? fromWire(String? v) =>
      PatientRelation.values.where((e) => e.wire == v).firstOrNull;
}

enum InsuranceType {
  employer('employer', 'Employer plan'),
  marketplace('marketplace', 'ACA / Marketplace'),
  medicare('medicare', 'Medicare'),
  medicaid('medicaid', 'Medicaid'),
  student('student', 'Student plan'),
  unknown('unknown', 'Not sure');

  const InsuranceType(this.wire, this.label);
  final String wire;
  final String label;

  static InsuranceType? fromWire(String? v) =>
      InsuranceType.values.where((e) => e.wire == v).firstOrNull;
}

enum DesiredOutcome {
  approveTreatment('approve_treatment', 'Approve my treatment or medication'),
  payBill('pay_bill', 'Pay the bill they denied'),
  reimburse('reimburse', 'Reimburse me for what I paid'),
  formularyException('formulary_exception', 'Grant a formulary exception'),
  networkException('network_exception', 'Grant a network exception'),
  externalReview('external_review', 'Independent external review');

  const DesiredOutcome(this.wire, this.label);
  final String wire;
  final String label;

  static DesiredOutcome? fromWire(String? v) =>
      DesiredOutcome.values.where((e) => e.wire == v).firstOrNull;
}

enum SupportingDocument {
  denialLetter('denial_letter', 'Denial letter'),
  eob('eob', 'Explanation of Benefits (EOB)'),
  bill('bill', 'Bill'),
  prescription('prescription', 'Prescription'),
  doctorLetter('doctor_letter', 'Letter from my doctor'),
  chartNotes('chart_notes', 'Chart / visit notes'),
  labResults('lab_results', 'Lab results'),
  medicalPolicy('medical_policy', "Insurer's medical policy"),
  callNotes('call_notes', 'Notes from insurer calls');

  const SupportingDocument(this.wire, this.label);
  final String wire;
  final String label;

  static SupportingDocument? fromWire(String? v) =>
      SupportingDocument.values.where((e) => e.wire == v).firstOrNull;
}

class TriedAlternative {
  const TriedAlternative({required this.name, required this.outcome});

  final String name;

  /// failed | not_tolerated | contraindicated | other
  final String outcome;

  factory TriedAlternative.fromJson(Map<String, dynamic> json) =>
      TriedAlternative(
        name: json['name'] as String? ?? '',
        outcome: json['outcome'] as String? ?? 'other',
      );

  Map<String, dynamic> toJson() => {'name': name, 'outcome': outcome};
}

class GuidedAnswers {
  const GuidedAnswers({
    this.relation,
    this.usState,
    this.insuranceType,
    this.desiredOutcome,
    this.isUrgent,
    this.urgencyNote,
    this.triedAlternatives = const [],
    this.documentsOnHand = const {},
    this.contactedInsurer,
    this.contactNotes,
  });

  final PatientRelation? relation;
  final String? usState;
  final InsuranceType? insuranceType;
  final DesiredOutcome? desiredOutcome;
  final bool? isUrgent;
  final String? urgencyNote;
  final List<TriedAlternative> triedAlternatives;
  final Set<SupportingDocument> documentsOnHand;
  final bool? contactedInsurer;

  /// Free text: dates called, reference numbers, who they spoke with.
  final String? contactNotes;

  factory GuidedAnswers.fromJson(Map<String, dynamic> json) => GuidedAnswers(
        relation: PatientRelation.fromWire(json['relation'] as String?),
        usState: json['usState'] as String?,
        insuranceType: InsuranceType.fromWire(json['insuranceType'] as String?),
        desiredOutcome:
            DesiredOutcome.fromWire(json['desiredOutcome'] as String?),
        isUrgent: json['isUrgent'] as bool?,
        urgencyNote: json['urgencyNote'] as String?,
        triedAlternatives: (json['triedAlternatives'] as List<dynamic>? ?? [])
            .whereType<Map<String, dynamic>>()
            .map(TriedAlternative.fromJson)
            .toList(),
        documentsOnHand: (json['documentsOnHand'] as List<dynamic>? ?? [])
            .whereType<String>()
            .map(SupportingDocument.fromWire)
            .whereType<SupportingDocument>()
            .toSet(),
        contactedInsurer: json['contactedInsurer'] as bool?,
        contactNotes: json['contactNotes'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'relation': relation?.wire,
        'usState': usState,
        'insuranceType': insuranceType?.wire,
        'desiredOutcome': desiredOutcome?.wire,
        'isUrgent': isUrgent,
        'urgencyNote': urgencyNote,
        'triedAlternatives': triedAlternatives.map((t) => t.toJson()).toList(),
        'documentsOnHand': documentsOnHand.map((d) => d.wire).toList(),
        'contactedInsurer': contactedInsurer,
        'contactNotes': contactNotes,
      };

  GuidedAnswers copyWith({
    PatientRelation? relation,
    String? usState,
    InsuranceType? insuranceType,
    DesiredOutcome? desiredOutcome,
    bool? isUrgent,
    String? urgencyNote,
    List<TriedAlternative>? triedAlternatives,
    Set<SupportingDocument>? documentsOnHand,
    bool? contactedInsurer,
    String? contactNotes,
  }) {
    return GuidedAnswers(
      relation: relation ?? this.relation,
      usState: usState ?? this.usState,
      insuranceType: insuranceType ?? this.insuranceType,
      desiredOutcome: desiredOutcome ?? this.desiredOutcome,
      isUrgent: isUrgent ?? this.isUrgent,
      urgencyNote: urgencyNote ?? this.urgencyNote,
      triedAlternatives: triedAlternatives ?? this.triedAlternatives,
      documentsOnHand: documentsOnHand ?? this.documentsOnHand,
      contactedInsurer: contactedInsurer ?? this.contactedInsurer,
      contactNotes: contactNotes ?? this.contactNotes,
    );
  }

  /// Validation used by the Guided Questions screen and covered by tests.
  /// Returns human-readable problems; empty list means the answers are
  /// complete enough to generate a packet.
  List<String> validate() {
    final problems = <String>[];
    if (relation == null) {
      problems.add('Tell us who the denial is for.');
    }
    if (usState == null || usState!.isEmpty) {
      problems.add('Select your state.');
    }
    if (insuranceType == null) {
      problems.add('Select your insurance type.');
    }
    if (desiredOutcome == null) {
      problems.add('Choose the outcome you want.');
    }
    if (isUrgent == true &&
        (urgencyNote == null || urgencyNote!.trim().isEmpty)) {
      problems.add('Briefly describe why a delay is harmful.');
    }
    if (contactedInsurer == true &&
        (contactNotes == null || contactNotes!.trim().isEmpty)) {
      problems
          .add('Add call dates or reference numbers from your insurer calls.');
    }
    for (final alt in triedAlternatives) {
      if (alt.name.trim().isEmpty) {
        problems.add('Each tried alternative needs a name.');
        break;
      }
    }
    return problems;
  }

  bool get isComplete => validate().isEmpty;
}

/// The shortest set of answers that materially improves a free preview.
///
/// The denial extraction is the source of truth: questions whose answers are
/// already supported by a source snippet stay out of the critical path. The
/// rest of the guided intake remains available as optional detail and is
/// persisted for the paid packet.
class PreviewQuestionPlan {
  const PreviewQuestionPlan({
    required this.askRelation,
    required this.askInsuranceType,
    required this.askUrgency,
    required this.askAlternatives,
  });

  final bool askRelation;
  final bool askInsuranceType;
  final bool askUrgency;
  final bool askAlternatives;

  factory PreviewQuestionPlan.fromExtraction(DenialExtraction extraction) {
    bool needsConfirmation(String field, Object? value) {
      final empty = value == null || (value is String && value.trim().isEmpty);
      final explicitlyMissing = extraction.missingFields
          .any((missing) => missing.toLowerCase() == field.toLowerCase());
      final hasSource = extraction.sourceSnippets
          .any((snippet) => snippet.field.toLowerCase() == field.toLowerCase());
      return empty || explicitlyMissing || !hasSource;
    }

    final category = extraction.denialCategory;
    final medicallyTimeSensitive = {
      DenialCategory.medication,
      DenialCategory.priorAuthorization,
      DenialCategory.notMedicallyNecessary,
      DenialCategory.stepTherapy,
      DenialCategory.formularyExclusion,
      DenialCategory.experimental,
    }.contains(category);
    final alternativesMatter = {
      DenialCategory.medication,
      DenialCategory.stepTherapy,
      DenialCategory.formularyExclusion,
    }.contains(category);

    return PreviewQuestionPlan(
      askRelation: needsConfirmation('patientName', extraction.patientName),
      askInsuranceType: needsConfirmation('planName', extraction.planName),
      askUrgency: medicallyTimeSensitive,
      askAlternatives: alternativesMatter,
    );
  }

  /// State and desired outcome are always required because neither can be
  /// safely inferred from a denial letter. Other requirements are conditional
  /// on what the extraction could not establish confidently.
  List<String> validate(GuidedAnswers answers) {
    final problems = <String>[];
    if (askRelation && answers.relation == null) {
      problems.add('Tell us who the denial is for.');
    }
    if (answers.usState == null || answers.usState!.isEmpty) {
      problems.add('Select your state.');
    }
    if (askInsuranceType && answers.insuranceType == null) {
      problems.add('Select your insurance type.');
    }
    if (answers.desiredOutcome == null) {
      problems.add('Choose the outcome you want.');
    }
    if (askUrgency && answers.isUrgent == null) {
      problems.add('Tell us whether a delay is urgent or harmful.');
    }
    if (askUrgency &&
        answers.isUrgent == true &&
        (answers.urgencyNote == null || answers.urgencyNote!.trim().isEmpty)) {
      problems.add('Briefly describe why a delay is harmful.');
    }
    if (askAlternatives) {
      for (final alternative in answers.triedAlternatives) {
        if (alternative.name.trim().isEmpty) {
          problems.add('Each tried alternative needs a name.');
          break;
        }
      }
    }
    return problems;
  }
}
