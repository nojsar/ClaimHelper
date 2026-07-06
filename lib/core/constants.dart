/// Product copy that carries legal/safety weight lives here so it is easy to
/// review in one place. Edit with care.
abstract final class AppCopy {
  static const appName = 'GetMyYes';

  static const tagline =
      'Turn your denied medication or treatment letter into a ready-to-send '
      'appeal packet in 15 minutes.';

  static const subTagline =
      'Upload your denial letter, EOB, or prior-authorization denial. '
      'GetMyYes drafts the appeal paperwork — you review and send it.';

  static const consentText =
      'I understand my documents may contain sensitive health and insurance '
      'information, and I consent to them being processed by an AI service to '
      'draft my appeal documents. Files are auto-deleted after 24 hours unless '
      'I save my case.';

  static const disclaimer =
      'GetMyYes is a document drafting assistant. It does not provide '
      'medical advice, legal advice, or insurance representation, and it does '
      'not decide medical necessity. There is no guarantee your appeal will be '
      'approved. Always review every document before sending it, and confirm '
      'deadlines directly with your insurer.';

  static const privacyBullets = [
    'Your files are processed only to draft your appeal — never for AI training.',
    'Uploads auto-delete after 24 hours unless you save your case.',
    'No analytics on your document contents.',
    'Delete your case and files any time.',
    'U.S. plans only at launch.',
  ];

  static const notMedicalAdviceShort =
      'Not medical, legal, or insurance advice. Review before sending.';
}

abstract final class UsStates {
  static const all = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI',
    'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN',
    'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH',
    'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA',
    'WV', 'WI', 'WY',
  ];
}

abstract final class Pricing {
  static const fullPacketUsd = 39;
  static const followUpRoundUsd = 19;
  static const fullCaseUsd = 59;

  /// Follow-up rounds included with every packet purchase.
  static const freeFollowUpRounds = 2;

  /// Full Case is capped — up to this many rounds per case, not unlimited.
  static const fullCaseRoundsCap = 100;
}

/// Compile-time switch: `flutter run --dart-define=USE_MOCKS=true` runs the
/// whole app against an in-memory backend (no Firebase project needed).
const bool kUseMocks = bool.fromEnvironment('USE_MOCKS');
