import 'dart:typed_data';

import '../models/appeal_case.dart';
import '../models/case_tracker.dart';
import '../models/extraction.dart';
import '../models/follow_up.dart';
import '../models/guided_answers.dart';
import '../models/packet.dart';

/// A file the user picked, normalized across web/mobile pickers.
class PickedUpload {
  const PickedUpload({
    required this.name,
    required this.bytes,
    required this.mimeType,
  });

  final String name;
  final Uint8List bytes;
  final String mimeType;
}

class UploadSession {
  const UploadSession({required this.caseId, required this.uploadPathPrefix});

  final String caseId;
  final String uploadPathPrefix;
}

/// Backend abstraction. `FirebaseBackend` talks to Cloud Functions /
/// Firestore / Storage; `MockBackend` runs the whole flow in memory so the
/// app can be exercised without a Firebase project
/// (`--dart-define=USE_MOCKS=true`).
abstract class Backend {
  /// Signs in (anonymously if needed) and returns the uid.
  Future<String> ensureSignedIn();

  bool get isAnonymous;
  String? get currentEmail;

  Future<void> linkWithEmail(String email, String password);
  Future<void> signInWithEmail(String email, String password);

  /// Signs into an existing account without abandoning [caseId]. The backend
  /// prepares the transfer while still anonymous, then claims it after auth.
  Future<void> signInWithEmailAndClaimCase(
      String email, String password, String caseId);

  /// Idempotently completes a previously prepared transfer. This also repairs
  /// a transfer after a transient network failure or page reload.
  Future<void> claimGuestCase(String caseId);
  Future<void> signOut();

  Future<UploadSession> createCaseUploadSession(
      {required bool consentConfirmed});

  /// Uploads files and reports 0..1 progress; returns storage paths.
  Future<List<String>> uploadSourceFiles(
    UploadSession session,
    List<PickedUpload> files, {
    void Function(double progress)? onProgress,
  });

  Future<DenialExtraction> extractDenial(String caseId, List<String> filePaths);

  Future<void> saveExtractionEdits(String caseId, DenialExtraction extraction);

  Future<void> saveGuidedAnswers(String caseId, GuidedAnswers answers);

  Future<FreePreview> generateFreePreview(
      String caseId, DenialExtraction current);

  /// Returns a checkout URL to redirect to (web) — null when mocked/paid.
  /// kind: 'packet' ($39) or 'packet_plus' ($59 packet + capped follow-ups).
  Future<String?> createCheckoutSession(String caseId,
      {String kind = 'packet'});

  /// Opt-in deadline reminders: stores the email on the case, sends a recap
  /// now, and schedules nudges server-side until the case is paid or deleted.
  Future<void> saveReminderEmail(String caseId, String email);

  Future<AppealPacket> generateAppealPacket(String caseId);

  Stream<AppealCase?> watchCase(String caseId);

  Future<AppealCase?> getCase(String caseId);

  Future<List<AppealCase>> listMyCases();

  Future<void> saveCase(String caseId);

  /// Saves the owner-only post-submission tracker. Returns true when an email
  /// reminder was scheduled for the expected insurer-response date.
  Future<bool> updateCaseTracker(String caseId, CaseTracker tracker);

  Future<void> deleteCaseAndFiles(String caseId);

  /// GDPR right-to-erasure: deletes every owned case (docs + files), the
  /// profile doc, and the auth account itself, then signs out locally.
  Future<void> deleteAccount();

  /// Adds more source files to an existing case (e.g. documents the preview
  /// flagged as missing); returns the storage paths of the new files.
  Future<List<String>> addFilesToCase(
    String caseId,
    List<PickedUpload> files, {
    void Function(double progress)? onProgress,
  });

  /// Persists free-text details the user supplied to fill preview gaps; the
  /// backend feeds them into preview and packet generation.
  Future<void> saveUserAdditions(String caseId, String text);

  /// Generates one follow-up round (consumes a round server-side).
  Future<FollowUpRound> generateFollowUp(
    String caseId, {
    required String outcome,
    required String notes,
  });

  /// Checkout for extra follow-up capacity. kind: 'followup_round' ($19) or
  /// 'full_case' (capped bundle). Returns the URL, or null when mocked.
  Future<String?> createFollowUpCheckout(String caseId, {required String kind});
}
