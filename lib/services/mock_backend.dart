import 'dart:async';

import '../models/appeal_case.dart';
import '../models/extraction.dart';
import '../models/follow_up.dart';
import '../models/guided_answers.dart';
import '../models/packet.dart';
import 'backend.dart';

/// In-memory backend used with `--dart-define=USE_MOCKS=true`. Lets the whole
/// flow (upload → extract → preview → pay → packet → delete) run with no
/// Firebase project. The mocked "AI" returns realistic canned data; it never
/// calls OpenAI. Useful for UI work, demos, and widget tests.
class MockBackend implements Backend {
  final Map<String, AppealCase> _cases = {};
  final Map<String, StreamController<AppealCase?>> _controllers = {};
  int _counter = 0;
  String? _email;

  @override
  Future<String> ensureSignedIn() async => 'mock-user';

  @override
  bool get isAnonymous => _email == null;

  @override
  String? get currentEmail => _email;

  @override
  Future<void> linkWithEmail(String email, String password) async {
    _email = email;
  }

  @override
  Future<void> signInWithEmail(String email, String password) async {
    _email = email;
  }

  @override
  Future<void> signOut() async {
    _email = null;
  }

  @override
  Future<UploadSession> createCaseUploadSession(
      {required bool consentConfirmed}) async {
    await Future<void>.delayed(const Duration(milliseconds: 200));
    final id = 'case_${++_counter}';
    _cases[id] = AppealCase(
      id: id,
      ownerUid: 'mock-user',
      status: CaseStatus.uploaded,
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
      expiresAt: DateTime.now().add(const Duration(hours: 24)),
    );
    return UploadSession(caseId: id, uploadPathPrefix: 'tempCases/$id/source/');
  }

  @override
  Future<List<String>> uploadSourceFiles(
    UploadSession session,
    List<PickedUpload> files, {
    void Function(double progress)? onProgress,
  }) async {
    for (var i = 1; i <= 5; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 120));
      onProgress?.call(i / 5);
    }
    final paths =
        files.map((f) => '${session.uploadPathPrefix}${f.name}').toList();
    _patch(session.caseId, (c) => c.copyWith(sourceFilePaths: paths));
    return paths;
  }

  @override
  Future<DenialExtraction> extractDenial(
      String caseId, List<String> filePaths) async {
    await Future<void>.delayed(const Duration(seconds: 2));
    const extraction = DenialExtraction(
      documentType: DocumentType.priorAuthorization,
      denialCategory: DenialCategory.stepTherapy,
      insurerName: 'Sample Health Plan',
      planName: 'Employer PPO',
      patientName: 'Jordan Sample',
      memberIdLast4: '4821',
      claimNumber: 'CLM-2026-0098213',
      priorAuthNumber: 'PA-77219',
      dateOfService: '2026-06-10',
      denialDate: '2026-06-18',
      appealDeadline: '2026-08-17',
      deniedItem: 'Wegovy (semaglutide) 2.4 mg',
      providerName: 'Riverbend Family Medicine',
      prescriberName: 'Dr. A. Chen, MD',
      denialReasonText:
          'Request denied. Plan requires trial of formulary alternatives '
          '(step therapy) before coverage of the requested medication.',
      amountBilled: 1349.00,
      patientResponsibility: 1349.00,
      appealInstructions:
          'Submit a written appeal within 60 days to the Appeals Department.',
      phoneNumbers: ['1-800-555-0134'],
      mailingAddresses: [
        'Sample Health Plan, Appeals Dept, PO Box 1000, Hartford, CT 06101'
      ],
      missingFields: ['dateOfBirth'],
      sourceSnippets: [
        SourceSnippet(
          field: 'denialReasonText',
          snippet: 'requires trial of formulary alternatives (step therapy)',
        ),
      ],
    );
    _patch(
        caseId,
        (c) =>
            c.copyWith(extraction: extraction, status: CaseStatus.extracted));
    return extraction;
  }

  @override
  Future<void> saveExtractionEdits(
      String caseId, DenialExtraction extraction) async {
    _patch(caseId, (c) => c.copyWith(extraction: extraction));
  }

  @override
  Future<void> saveGuidedAnswers(String caseId, GuidedAnswers answers) async {
    _patch(caseId, (c) => c.copyWith(guidedAnswers: answers));
  }

  @override
  Future<FreePreview> generateFreePreview(
      String caseId, DenialExtraction current) async {
    await Future<void>.delayed(const Duration(seconds: 1));
    final preview = FreePreview(
      denialSummary:
          '${current.insurerName ?? 'Your plan'} denied coverage for '
          '${current.deniedItem ?? 'the requested item'} because it applied '
          'step therapy — it wants you to try formulary alternatives first. '
          'This is a common, appealable denial.',
      amountAtStake: current.patientResponsibility != null
          ? '\$${current.patientResponsibility!.toStringAsFixed(0)} at stake'
          : null,
      likelyAppealPath:
          'Internal appeal with a step-therapy exception request, citing '
          'alternatives already tried or medically inadvisable.',
      missingInfo: const [
        'List of formulary alternatives you have already tried or cannot take',
        'A supporting statement from your prescriber',
      ],
      recommendedPacketType: 'Step-therapy exception appeal packet',
    );
    _patch(caseId,
        (c) => c.copyWith(preview: preview, status: CaseStatus.preview));
    return preview;
  }

  @override
  Future<String?> createCheckoutSession(String caseId) async {
    // Mock checkout: mark paid immediately (simulates the Stripe webhook).
    await Future<void>.delayed(const Duration(milliseconds: 400));
    _patch(
        caseId,
        (c) => c.copyWith(
            paid: true,
            pricePaid: 39,
            followUpCredits: 2,
            status: CaseStatus.paid));
    return null;
  }

  @override
  Future<List<String>> addFilesToCase(
    String caseId,
    List<PickedUpload> files, {
    void Function(double progress)? onProgress,
  }) async {
    for (var i = 1; i <= 3; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 120));
      onProgress?.call(i / 3);
    }
    final paths =
        files.map((f) => 'tempCases/$caseId/source/${f.name}').toList();
    _patch(caseId,
        (c) => c.copyWith(sourceFilePaths: [...c.sourceFilePaths, ...paths]));
    return paths;
  }

  @override
  Future<void> saveUserAdditions(String caseId, String text) async {
    // The mock preview doesn't consume additions; storing is a no-op.
  }

  @override
  Future<FollowUpRound> generateFollowUp(
    String caseId, {
    required String outcome,
    required String notes,
  }) async {
    await Future<void>.delayed(const Duration(seconds: 2));
    final c = _cases[caseId]!;
    final remaining = c.followUpCredits ?? 2;
    if (!c.paid || remaining <= 0) {
      throw StateError('No follow-up rounds left.');
    }
    final round = FollowUpRound(
      outcome: outcome,
      userNotes: notes,
      situationSummary:
          'The insurer\'s response keeps the denial in place on step-therapy '
          'grounds. Your strongest path is a second-level appeal with the '
          'prescriber documentation attached.',
      recommendedNextSteps:
          '1) Ask your prescriber for the trial/failure documentation.\n'
          '2) Submit the second-level appeal letter below within the deadline.\n'
          '3) If denied again, request external review through your state.',
      responseLetter:
          'To the Appeals Department,\n\nI am escalating my appeal of the '
          'denial referenced above. [ATTACH: prescriber documentation of '
          'alternatives tried or contraindicated]\n\nPlease reconsider and '
          'approve coverage, or provide external-review instructions.\n\n'
          'Sincerely,\n[Your name]',
      callScript:
          'Hi, I\'m calling about my pending appeal. Can you confirm you '
          'received my second-level appeal, the review timeline, and whether '
          'anything is missing from my file?',
      deadlineNotes: 'Second-level appeals are commonly due within 60 days of '
          'the latest denial — confirm with your insurer.',
      warnings: const ['Confirm every deadline directly with your insurer.'],
      disclaimer:
          'This follow-up is a draft to help you continue your appeal. It is '
          'not medical, legal, or insurance advice.',
      createdAt: DateTime.now(),
    );
    _patch(
        caseId,
        (c) => c.copyWith(
            followUps: [...c.followUps, round],
            followUpCredits: remaining - 1));
    return round;
  }

  @override
  Future<String?> createFollowUpCheckout(String caseId,
      {required String kind}) async {
    await Future<void>.delayed(const Duration(milliseconds: 400));
    _patch(
        caseId,
        (c) => kind == 'full_case'
            ? c.copyWith(followUpCredits: 100, fullCase: true)
            : c.copyWith(followUpCredits: (c.followUpCredits ?? 2) + 1));
    return null;
  }

  @override
  Future<AppealPacket> generateAppealPacket(String caseId) async {
    await Future<void>.delayed(const Duration(seconds: 2));
    final c = _cases[caseId]!;
    final ex = c.extraction!;
    final packet = AppealPacket(
      plainEnglishSummary:
          'Your plan applied step therapy to ${ex.deniedItem}. You can ask '
          'for an exception by showing that the required alternatives are not '
          'appropriate for you. This packet drafts that request for your review.',
      appealStrategy:
          'Request a step-therapy (fail-first) exception through an internal '
          'appeal, supported by your prescriber, and preserve your right to '
          'external review if the internal appeal is denied.',
      appealLetter: _mockLetter(ex, c.guidedAnswers),
      doctorLetterRequest:
          'Dear Dr. ${ex.prescriberName ?? '[Prescriber]'},\n\nMy insurer '
          '(${ex.insurerName ?? '[Insurer]'}) denied ${ex.deniedItem} citing '
          'step therapy. Could you provide a brief letter of medical necessity '
          'describing why the required formulary alternatives are not '
          'appropriate for me, referencing my history? Please include your '
          'clinical rationale and any records that support it.\n\nThank you.',
      evidenceChecklist: const [
        EvidenceItem(
          item: 'Prescriber letter of medical necessity',
          whyNeeded: 'Directly rebuts the step-therapy denial reason.',
          status: 'missing',
        ),
        EvidenceItem(
          item: 'Record of alternatives tried, failed, or contraindicated',
          whyNeeded: 'Supports a fail-first exception.',
          status: 'missing',
        ),
        EvidenceItem(
          item: 'Copy of the denial letter',
          whyNeeded: 'Establishes claim/PA numbers and the appeal deadline.',
          status: 'provided',
        ),
      ],
      insurerCallScript:
          'Hi, my name is ${ex.patientName ?? '[Name]'}, member ID ending '
          '${ex.memberIdLast4 ?? '[####]'}. I\'m calling about prior auth '
          '${ex.priorAuthNumber ?? '[PA#]'} denied on ${ex.denialDate ?? '[date]'}. '
          'I\'m filing an internal appeal and requesting a step-therapy '
          'exception. Can you confirm the appeal address, the deadline, and '
          'whether you need a specific form?',
      deadlineChecklist: [
        DeadlineItem(
          task: 'Submit internal appeal',
          dueDate: ex.appealDeadline,
          priority: 'high',
        ),
        const DeadlineItem(
          task: 'Request prescriber support letter',
          dueDate: null,
          priority: 'high',
        ),
        const DeadlineItem(
          task: 'Confirm deadline with insurer by phone',
          dueDate: null,
          priority: 'medium',
        ),
      ],
      warnings: const [
        'Confirm the exact appeal deadline with your insurer — missing it can '
            'forfeit your appeal rights.',
        'Do not state a treatment is medically necessary unless your provider '
            'has said so in writing.',
      ],
      disclaimer:
          'This packet is a draft to help you appeal. It is not medical, '
          'legal, or insurance advice, and approval is not guaranteed. Review '
          'everything before sending.',
    );
    _patch(caseId,
        (c) => c.copyWith(packet: packet, status: CaseStatus.generated));
    return packet;
  }

  @override
  Stream<AppealCase?> watchCase(String caseId) {
    final controller = _controllers.putIfAbsent(
        caseId, () => StreamController<AppealCase?>.broadcast());
    scheduleMicrotask(() => controller.add(_cases[caseId]));
    return controller.stream;
  }

  @override
  Future<AppealCase?> getCase(String caseId) async => _cases[caseId];

  @override
  Future<List<AppealCase>> listMyCases() async {
    final list = _cases.values.toList()
      ..sort((a, b) =>
          (b.updatedAt ?? DateTime(0)).compareTo(a.updatedAt ?? DateTime(0)));
    return list;
  }

  @override
  Future<void> saveCase(String caseId) async {
    _patch(caseId, (c) => c.copyWith(saved: true));
  }

  @override
  Future<void> deleteCaseAndFiles(String caseId) async {
    _cases.remove(caseId);
    _controllers[caseId]?.add(null);
  }

  void _patch(String caseId, AppealCase Function(AppealCase) update) {
    final current = _cases[caseId];
    if (current == null) return;
    final next = update(current);
    _cases[caseId] = next;
    _controllers[caseId]?.add(next);
  }

  String _mockLetter(DenialExtraction ex, GuidedAnswers? answers) {
    return '''
${DateTime.now().toIso8601String().split('T').first}

${ex.insurerName ?? '[Insurer name]'}
Appeals Department
${ex.mailingAddresses.isNotEmpty ? ex.mailingAddresses.first : '[Appeals mailing address]'}

Re: Appeal of denial — ${ex.deniedItem ?? '[Denied item]'}
Member: ${ex.patientName ?? '[Member name]'} (ID ending ${ex.memberIdLast4 ?? '[####]'})
Claim/PA #: ${ex.priorAuthNumber ?? ex.claimNumber ?? '[Reference #]'}
Date of denial: ${ex.denialDate ?? '[Denial date]'}

To the Appeals Department,

I am writing to formally appeal the denial of ${ex.deniedItem ?? 'the requested treatment'}, which was denied on the basis of step therapy. My provider recommended this treatment, and I am requesting that you reconsider based on the attached documentation.

[ATTACH: prescriber letter of medical necessity]
[ATTACH: record of alternatives already tried, failed, or not tolerated]

Please reconsider this decision and approve coverage. If the internal appeal is upheld, I request information on my right to an external review.

Sincerely,
${ex.patientName ?? '[Your name]'}
''';
  }
}
