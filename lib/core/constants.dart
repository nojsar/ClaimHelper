/// Product copy that carries legal/safety weight lives here so it is easy to
/// review in one place. Edit with care.
abstract final class AppCopy {
  static const appName = 'GetMyYes';

  static const tagline =
      'Understand your health-insurance denial and prepare a clear appeal '
      'packet you review and control.';

  static const subTagline =
      'Upload your denial letter, EOB, or prior-authorization denial. '
      'Review a free plain-English summary before deciding whether to build '
      'the complete paperwork.';

  static const consentText =
      'I give explicit consent for GetMyYes and its AI service to process the '
      'health and insurance information in these files only to draft my appeal. '
      'Unsaved files are deleted after 24 hours; I can withdraw consent by '
      'deleting my case.';

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

/// Canonical public URLs. Keep app links aligned with sitemap/canonical tags so
/// users and crawlers never take an avoidable Firebase clean-URL redirect.
abstract final class AppUrls {
  static const origin = 'https://getmyyes.com';
  static const terms = '$origin/terms';
  static const accuracyGuarantee = '$terms#accuracy-guarantee';
  static const privacy = '$origin/privacy';
  static const accessibility = '$origin/accessibility';
  static const insurerDenialRates = '$origin/insurer-denial-rates';
  static const externalReview = '$origin/appeals/external-review';
}

abstract final class UsStates {
  static const all = [
    'AL',
    'AK',
    'AZ',
    'AR',
    'CA',
    'CO',
    'CT',
    'DE',
    'DC',
    'FL',
    'GA',
    'HI',
    'ID',
    'IL',
    'IN',
    'IA',
    'KS',
    'KY',
    'LA',
    'ME',
    'MD',
    'MA',
    'MI',
    'MN',
    'MS',
    'MO',
    'MT',
    'NE',
    'NV',
    'NH',
    'NJ',
    'NM',
    'NY',
    'NC',
    'ND',
    'OH',
    'OK',
    'OR',
    'PA',
    'RI',
    'SC',
    'SD',
    'TN',
    'TX',
    'UT',
    'VT',
    'VA',
    'WA',
    'WV',
    'WI',
    'WY',
  ];
}

abstract final class Pricing {
  static const fullPacketUsd = 39;
  static const followUpRoundUsd = 19;
  static const fullCaseUsd = 59;
  static const fullCaseUpgradeUsd = 20;

  /// Follow-up rounds included with every packet purchase.
  static const freeFollowUpRounds = 2;

  /// Full Case is capped — up to this many drafting rounds per case.
  static const fullCaseRoundsCap = 10;
}

/// Compile-time switch: `flutter run --dart-define=USE_MOCKS=true` runs the
/// whole app against an in-memory backend (no Firebase project needed).
const bool kUseMocks = bool.fromEnvironment('USE_MOCKS');

/// Owner account uid (dunojus10@gmail.com). Shows the Analytics nav button
/// and unlocks the /stats dashboard UI. Real enforcement is server-side:
/// firestore.rules gate analytics reads and createCheckoutSession comps
/// purchases for this uid only.
const String kAdminUid = '6ZETq21uHIartXQlCCrZnZiQhb83';
