enum SubmissionMethod {
  onlinePortal('online_portal', 'Online portal'),
  fax('fax', 'Fax'),
  certifiedMail('certified_mail', 'Certified mail'),
  standardMail('standard_mail', 'Standard mail'),
  email('email', 'Email'),
  phone('phone', 'Phone'),
  inPerson('in_person', 'In person'),
  other('other', 'Other');

  const SubmissionMethod(this.wire, this.label);
  final String wire;
  final String label;

  static SubmissionMethod fromWire(String? value) =>
      SubmissionMethod.values.firstWhere(
        (item) => item.wire == value,
        orElse: () => SubmissionMethod.onlinePortal,
      );
}

enum InsurerResponseStatus {
  noResponseYet('no_response_yet', 'No response yet'),
  acknowledged('acknowledged', 'Received / acknowledged'),
  underReview('under_review', 'Under review'),
  informationRequested('information_requested', 'Asked for more information'),
  decisionReceived('decision_received', 'Decision received'),
  closed('closed', 'Closed');

  const InsurerResponseStatus(this.wire, this.label);
  final String wire;
  final String label;

  static InsurerResponseStatus fromWire(String? value) =>
      InsurerResponseStatus.values.firstWhere(
        (item) => item.wire == value,
        orElse: () => InsurerResponseStatus.noResponseYet,
      );
}

enum AppealOutcome {
  pending('pending', 'Pending'),
  approved('approved', 'Approved'),
  partiallyApproved('partially_approved', 'Partially approved'),
  denied('denied', 'Denied'),
  withdrawn('withdrawn', 'Withdrawn');

  const AppealOutcome(this.wire, this.label);
  final String wire;
  final String label;

  static AppealOutcome fromWire(String? value) =>
      AppealOutcome.values.firstWhere(
        (item) => item.wire == value,
        orElse: () => AppealOutcome.pending,
      );
}

/// Owner-only, server-validated progress for a submitted appeal.
///
/// This object deliberately has no free-form response notes. Detailed insurer
/// letters belong in the follow-up workflow, while the tracker keeps only the
/// minimum operational fields needed for dates, reminders, and next steps.
class CaseTracker {
  const CaseTracker({
    required this.submittedDate,
    required this.submissionMethod,
    this.confirmationNumber,
    this.expectedResponseDate,
    this.responseDate,
    this.responseStatus = InsurerResponseStatus.noResponseYet,
    this.outcome = AppealOutcome.pending,
    this.responseReminderEnabled = true,
    this.updatedAt,
  });

  final DateTime submittedDate;
  final SubmissionMethod submissionMethod;
  final String? confirmationNumber;
  final DateTime? expectedResponseDate;
  final DateTime? responseDate;
  final InsurerResponseStatus responseStatus;
  final AppealOutcome outcome;
  final bool responseReminderEnabled;
  final DateTime? updatedAt;

  factory CaseTracker.fromJson(Map<String, dynamic> json) {
    return CaseTracker(
      submittedDate: _toDate(json['submittedDate']) ?? DateTime.now(),
      submissionMethod:
          SubmissionMethod.fromWire(json['submissionMethod'] as String?),
      confirmationNumber: json['confirmationNumber'] as String?,
      expectedResponseDate: _toDate(json['expectedResponseDate']),
      responseDate: _toDate(json['responseDate']),
      responseStatus:
          InsurerResponseStatus.fromWire(json['responseStatus'] as String?),
      outcome: AppealOutcome.fromWire(json['outcome'] as String?),
      responseReminderEnabled:
          json['responseReminderEnabled'] as bool? ?? false,
      updatedAt: _toDate(json['updatedAt']),
    );
  }

  Map<String, dynamic> toJson() => {
        'submittedDate': _dateOnly(submittedDate),
        'submissionMethod': submissionMethod.wire,
        'confirmationNumber': confirmationNumber,
        'expectedResponseDate': expectedResponseDate == null
            ? null
            : _dateOnly(expectedResponseDate!),
        'responseDate': responseDate == null ? null : _dateOnly(responseDate!),
        'responseStatus': responseStatus.wire,
        'outcome': outcome.wire,
        'responseReminderEnabled': responseReminderEnabled,
      };

  static String _dateOnly(DateTime date) =>
      '${date.year.toString().padLeft(4, '0')}-'
      '${date.month.toString().padLeft(2, '0')}-'
      '${date.day.toString().padLeft(2, '0')}';

  static DateTime? _toDate(dynamic value) {
    if (value == null) return null;
    if (value is DateTime) return value;
    if (value is String) return DateTime.tryParse(value);
    try {
      return (value as dynamic).toDate() as DateTime;
    } catch (_) {
      return null;
    }
  }
}
