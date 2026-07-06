/// One follow-up assistance round on a paid case: the user reports what the
/// insurer did (or didn't do), and the backend drafts the next move.
class FollowUpRound {
  const FollowUpRound({
    required this.outcome,
    this.userNotes,
    required this.situationSummary,
    required this.recommendedNextSteps,
    required this.responseLetter,
    required this.callScript,
    this.deadlineNotes,
    this.warnings = const [],
    required this.disclaimer,
    this.createdAt,
  });

  final String outcome;
  final String? userNotes;
  final String situationSummary;
  final String recommendedNextSteps;
  final String responseLetter;
  final String callScript;
  final String? deadlineNotes;
  final List<String> warnings;
  final String disclaimer;
  final DateTime? createdAt;

  factory FollowUpRound.fromJson(Map<String, dynamic> json) {
    return FollowUpRound(
      outcome: json['outcome'] as String? ?? 'unknown',
      userNotes: json['userNotes'] as String?,
      situationSummary: json['situationSummary'] as String? ?? '',
      recommendedNextSteps: json['recommendedNextSteps'] as String? ?? '',
      responseLetter: json['responseLetter'] as String? ?? '',
      callScript: json['callScript'] as String? ?? '',
      deadlineNotes: json['deadlineNotes'] as String?,
      warnings: (json['warnings'] as List<dynamic>? ?? [])
          .whereType<String>()
          .toList(),
      disclaimer: json['disclaimer'] as String? ?? '',
      createdAt: json['createdAt'] is String
          ? DateTime.tryParse(json['createdAt'] as String)
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'outcome': outcome,
        'userNotes': userNotes,
        'situationSummary': situationSummary,
        'recommendedNextSteps': recommendedNextSteps,
        'responseLetter': responseLetter,
        'callScript': callScript,
        'deadlineNotes': deadlineNotes,
        'warnings': warnings,
        'disclaimer': disclaimer,
        'createdAt': createdAt?.toIso8601String(),
      };
}
