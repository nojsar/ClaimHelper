import 'dart:typed_data';

import '../models/appeal_case.dart';
import '../models/extraction.dart';
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
  Future<void> signOut();

  Future<UploadSession> createCaseUploadSession({required bool consentConfirmed});

  /// Uploads files and reports 0..1 progress; returns storage paths.
  Future<List<String>> uploadSourceFiles(
    UploadSession session,
    List<PickedUpload> files, {
    void Function(double progress)? onProgress,
  });

  Future<DenialExtraction> extractDenial(String caseId, List<String> filePaths);

  Future<void> saveExtractionEdits(String caseId, DenialExtraction extraction);

  Future<void> saveGuidedAnswers(String caseId, GuidedAnswers answers);

  Future<FreePreview> generateFreePreview(String caseId, DenialExtraction current);

  /// Returns a checkout URL to redirect to (web) — null when mocked/paid.
  Future<String?> createCheckoutSession(String caseId);

  Future<AppealPacket> generateAppealPacket(String caseId);

  Stream<AppealCase?> watchCase(String caseId);

  Future<AppealCase?> getCase(String caseId);

  Future<List<AppealCase>> listMyCases();

  Future<void> saveCase(String caseId);

  Future<void> deleteCaseAndFiles(String caseId);
}
