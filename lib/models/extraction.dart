/// Typed model for the strict-JSON extraction returned by
/// `extractDenialFromUploadedFile`. Field names mirror the OpenAI schema.
class SourceSnippet {
  const SourceSnippet({required this.field, required this.snippet});

  final String field;
  final String snippet;

  factory SourceSnippet.fromJson(Map<String, dynamic> json) => SourceSnippet(
        field: json['field'] as String? ?? '',
        snippet: json['snippet'] as String? ?? '',
      );

  Map<String, dynamic> toJson() => {'field': field, 'snippet': snippet};
}

enum DocumentType {
  denialLetter('denial_letter', 'Denial letter'),
  eob('eob', 'Explanation of Benefits'),
  priorAuthorization('prior_authorization', 'Prior authorization'),
  bill('bill', 'Bill'),
  unknown('unknown', 'Unknown');

  const DocumentType(this.wire, this.label);
  final String wire;
  final String label;

  static DocumentType fromWire(String? value) => DocumentType.values
      .firstWhere((e) => e.wire == value, orElse: () => DocumentType.unknown);
}

enum DenialCategory {
  medication('medication', 'Medication denial'),
  priorAuthorization('prior_authorization', 'Prior authorization denial'),
  notMedicallyNecessary('not_medically_necessary', 'Not medically necessary'),
  stepTherapy('step_therapy', 'Step therapy'),
  formularyExclusion('formulary_exclusion', 'Formulary exclusion'),
  outOfNetwork('out_of_network', 'Out of network'),
  excludedBenefit('excluded_benefit', 'Excluded benefit'),
  duplicateClaim('duplicate_claim', 'Duplicate claim'),
  missingInformation('missing_information', 'Missing information'),
  experimental('experimental', 'Experimental / investigational'),
  partialPayment('partial_payment', 'Partial payment'),
  unknown('unknown', 'Unknown');

  const DenialCategory(this.wire, this.label);
  final String wire;
  final String label;

  static DenialCategory fromWire(String? value) => DenialCategory.values
      .firstWhere((e) => e.wire == value, orElse: () => DenialCategory.unknown);
}

class DenialExtraction {
  const DenialExtraction({
    required this.documentType,
    required this.denialCategory,
    this.insurerName,
    this.planName,
    this.patientName,
    this.memberIdLast4,
    this.claimNumber,
    this.priorAuthNumber,
    this.dateOfService,
    this.denialDate,
    this.appealDeadline,
    this.deniedItem,
    this.providerName,
    this.prescriberName,
    this.denialReasonText,
    this.amountBilled,
    this.patientResponsibility,
    this.appealInstructions,
    this.phoneNumbers = const [],
    this.mailingAddresses = const [],
    this.missingFields = const [],
    this.sourceSnippets = const [],
  });

  final DocumentType documentType;
  final DenialCategory denialCategory;
  final String? insurerName;
  final String? planName;
  final String? patientName;
  final String? memberIdLast4;
  final String? claimNumber;
  final String? priorAuthNumber;
  final String? dateOfService;
  final String? denialDate;
  final String? appealDeadline;
  final String? deniedItem;
  final String? providerName;
  final String? prescriberName;
  final String? denialReasonText;
  final double? amountBilled;
  final double? patientResponsibility;
  final String? appealInstructions;
  final List<String> phoneNumbers;
  final List<String> mailingAddresses;
  final List<String> missingFields;
  final List<SourceSnippet> sourceSnippets;

  factory DenialExtraction.fromJson(Map<String, dynamic> json) {
    return DenialExtraction(
      documentType: DocumentType.fromWire(json['documentType'] as String?),
      denialCategory: DenialCategory.fromWire(json['denialCategory'] as String?),
      insurerName: json['insurerName'] as String?,
      planName: json['planName'] as String?,
      patientName: json['patientName'] as String?,
      memberIdLast4: json['memberIdLast4'] as String?,
      claimNumber: json['claimNumber'] as String?,
      priorAuthNumber: json['priorAuthNumber'] as String?,
      dateOfService: json['dateOfService'] as String?,
      denialDate: json['denialDate'] as String?,
      appealDeadline: json['appealDeadline'] as String?,
      deniedItem: json['deniedItem'] as String?,
      providerName: json['providerName'] as String?,
      prescriberName: json['prescriberName'] as String?,
      denialReasonText: json['denialReasonText'] as String?,
      amountBilled: (json['amountBilled'] as num?)?.toDouble(),
      patientResponsibility:
          (json['patientResponsibility'] as num?)?.toDouble(),
      appealInstructions: json['appealInstructions'] as String?,
      phoneNumbers: _stringList(json['phoneNumbers']),
      mailingAddresses: _stringList(json['mailingAddresses']),
      missingFields: _stringList(json['missingFields']),
      sourceSnippets: (json['sourceSnippets'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(SourceSnippet.fromJson)
          .toList(),
    );
  }

  static List<String> _stringList(dynamic value) =>
      (value as List<dynamic>? ?? []).whereType<String>().toList();

  Map<String, dynamic> toJson() => {
        'documentType': documentType.wire,
        'denialCategory': denialCategory.wire,
        'insurerName': insurerName,
        'planName': planName,
        'patientName': patientName,
        'memberIdLast4': memberIdLast4,
        'claimNumber': claimNumber,
        'priorAuthNumber': priorAuthNumber,
        'dateOfService': dateOfService,
        'denialDate': denialDate,
        'appealDeadline': appealDeadline,
        'deniedItem': deniedItem,
        'providerName': providerName,
        'prescriberName': prescriberName,
        'denialReasonText': denialReasonText,
        'amountBilled': amountBilled,
        'patientResponsibility': patientResponsibility,
        'appealInstructions': appealInstructions,
        'phoneNumbers': phoneNumbers,
        'mailingAddresses': mailingAddresses,
        'missingFields': missingFields,
        'sourceSnippets': sourceSnippets.map((s) => s.toJson()).toList(),
      };

  DenialExtraction copyWith({
    DocumentType? documentType,
    DenialCategory? denialCategory,
    String? insurerName,
    String? planName,
    String? patientName,
    String? memberIdLast4,
    String? claimNumber,
    String? priorAuthNumber,
    String? dateOfService,
    String? denialDate,
    String? appealDeadline,
    String? deniedItem,
    String? providerName,
    String? prescriberName,
    String? denialReasonText,
    double? amountBilled,
    double? patientResponsibility,
    String? appealInstructions,
  }) {
    return DenialExtraction(
      documentType: documentType ?? this.documentType,
      denialCategory: denialCategory ?? this.denialCategory,
      insurerName: insurerName ?? this.insurerName,
      planName: planName ?? this.planName,
      patientName: patientName ?? this.patientName,
      memberIdLast4: memberIdLast4 ?? this.memberIdLast4,
      claimNumber: claimNumber ?? this.claimNumber,
      priorAuthNumber: priorAuthNumber ?? this.priorAuthNumber,
      dateOfService: dateOfService ?? this.dateOfService,
      denialDate: denialDate ?? this.denialDate,
      appealDeadline: appealDeadline ?? this.appealDeadline,
      deniedItem: deniedItem ?? this.deniedItem,
      providerName: providerName ?? this.providerName,
      prescriberName: prescriberName ?? this.prescriberName,
      denialReasonText: denialReasonText ?? this.denialReasonText,
      amountBilled: amountBilled ?? this.amountBilled,
      patientResponsibility:
          patientResponsibility ?? this.patientResponsibility,
      appealInstructions: appealInstructions ?? this.appealInstructions,
      phoneNumbers: phoneNumbers,
      mailingAddresses: mailingAddresses,
      missingFields: missingFields,
      sourceSnippets: sourceSnippets,
    );
  }
}
