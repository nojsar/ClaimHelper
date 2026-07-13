/// Typed models for the free preview and the paid appeal packet.
library;

class FreePreview {
  const FreePreview({
    required this.denialSummary,
    this.amountAtStake,
    required this.likelyAppealPath,
    this.missingInfo = const [],
    required this.recommendedPacketType,
    this.letterOpening,
  });

  final String denialSummary;
  final String? amountAtStake;
  final String likelyAppealPath;
  final List<String> missingInfo;
  final String recommendedPacketType;

  /// First sentences of the real appeal letter — shown (then cut off) on the
  /// paywall so the user sees the packet already citing their denial back.
  /// Nullable: previews stored before this field existed don't have it.
  final String? letterOpening;

  factory FreePreview.fromJson(Map<String, dynamic> json) => FreePreview(
        denialSummary: json['denialSummary'] as String? ?? '',
        amountAtStake: json['amountAtStake'] as String?,
        likelyAppealPath: json['likelyAppealPath'] as String? ?? '',
        missingInfo: (json['missingInfo'] as List<dynamic>? ?? [])
            .whereType<String>()
            .toList(),
        recommendedPacketType:
            json['recommendedPacketType'] as String? ?? 'Appeal packet',
        letterOpening: json['letterOpening'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'denialSummary': denialSummary,
        'amountAtStake': amountAtStake,
        'likelyAppealPath': likelyAppealPath,
        'missingInfo': missingInfo,
        'recommendedPacketType': recommendedPacketType,
        'letterOpening': letterOpening,
      };
}

class EvidenceItem {
  const EvidenceItem({
    required this.item,
    required this.whyNeeded,
    required this.status,
  });

  final String item;
  final String whyNeeded;

  /// provided | missing | optional
  final String status;

  factory EvidenceItem.fromJson(Map<String, dynamic> json) => EvidenceItem(
        item: json['item'] as String? ?? '',
        whyNeeded: json['whyNeeded'] as String? ?? '',
        status: json['status'] as String? ?? 'optional',
      );

  Map<String, dynamic> toJson() =>
      {'item': item, 'whyNeeded': whyNeeded, 'status': status};
}

class DeadlineItem {
  const DeadlineItem(
      {required this.task, this.dueDate, required this.priority});

  final String task;
  final String? dueDate;

  /// high | medium | low
  final String priority;

  factory DeadlineItem.fromJson(Map<String, dynamic> json) => DeadlineItem(
        task: json['task'] as String? ?? '',
        dueDate: json['dueDate'] as String?,
        priority: json['priority'] as String? ?? 'medium',
      );

  Map<String, dynamic> toJson() =>
      {'task': task, 'dueDate': dueDate, 'priority': priority};
}

class AppealPacket {
  const AppealPacket({
    required this.plainEnglishSummary,
    required this.appealStrategy,
    required this.appealLetter,
    required this.doctorLetterRequest,
    this.evidenceChecklist = const [],
    required this.insurerCallScript,
    this.deadlineChecklist = const [],
    this.warnings = const [],
    required this.disclaimer,
  });

  final String plainEnglishSummary;
  final String appealStrategy;
  final String appealLetter;
  final String doctorLetterRequest;
  final List<EvidenceItem> evidenceChecklist;
  final String insurerCallScript;
  final List<DeadlineItem> deadlineChecklist;
  final List<String> warnings;
  final String disclaimer;

  factory AppealPacket.fromJson(Map<String, dynamic> json) => AppealPacket(
        plainEnglishSummary: json['plainEnglishSummary'] as String? ?? '',
        appealStrategy: json['appealStrategy'] as String? ?? '',
        appealLetter: json['appealLetter'] as String? ?? '',
        doctorLetterRequest: json['doctorLetterRequest'] as String? ?? '',
        evidenceChecklist: (json['evidenceChecklist'] as List<dynamic>? ?? [])
            .whereType<Map<String, dynamic>>()
            .map(EvidenceItem.fromJson)
            .toList(),
        insurerCallScript: json['insurerCallScript'] as String? ?? '',
        deadlineChecklist: (json['deadlineChecklist'] as List<dynamic>? ?? [])
            .whereType<Map<String, dynamic>>()
            .map(DeadlineItem.fromJson)
            .toList(),
        warnings: (json['warnings'] as List<dynamic>? ?? [])
            .whereType<String>()
            .toList(),
        disclaimer: json['disclaimer'] as String? ?? '',
      );

  Map<String, dynamic> toJson() => {
        'plainEnglishSummary': plainEnglishSummary,
        'appealStrategy': appealStrategy,
        'appealLetter': appealLetter,
        'doctorLetterRequest': doctorLetterRequest,
        'evidenceChecklist': evidenceChecklist.map((e) => e.toJson()).toList(),
        'insurerCallScript': insurerCallScript,
        'deadlineChecklist': deadlineChecklist.map((d) => d.toJson()).toList(),
        'warnings': warnings,
        'disclaimer': disclaimer,
      };
}
