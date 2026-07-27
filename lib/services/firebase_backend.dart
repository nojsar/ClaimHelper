import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';

import '../models/appeal_case.dart';
import '../models/case_tracker.dart';
import '../models/extraction.dart';
import '../models/follow_up.dart';
import '../models/guided_answers.dart';
import '../models/packet.dart';
import 'upload_object_name.dart';
import 'backend.dart';

/// Production backend. All OpenAI and Stripe work happens in Cloud
/// Functions; this class only moves data. No secrets live client-side.
class FirebaseBackend implements Backend {
  FirebaseBackend({
    FirebaseAuth? auth,
    FirebaseFirestore? firestore,
    FirebaseStorage? storage,
    FirebaseFunctions? functions,
  })  : _auth = auth ?? FirebaseAuth.instance,
        _db = firestore ?? FirebaseFirestore.instance,
        _storage = storage ?? FirebaseStorage.instance,
        _functions = functions ?? FirebaseFunctions.instance;

  final FirebaseAuth _auth;
  final FirebaseFirestore _db;
  final FirebaseStorage _storage;
  final FirebaseFunctions _functions;

  @override
  Future<String> ensureSignedIn() async {
    final existing = _auth.currentUser;
    if (existing != null) return existing.uid;
    // Guest sessions use anonymous auth; no visible account creation until
    // the user purchases or saves a case.
    final cred = await _auth.signInAnonymously();
    return cred.user!.uid;
  }

  @override
  bool get isAnonymous => _auth.currentUser?.isAnonymous ?? true;

  @override
  String? get currentEmail => _auth.currentUser?.email;

  @override
  Future<void> linkWithEmail(String email, String password) async {
    final user = _auth.currentUser;
    final credential =
        EmailAuthProvider.credential(email: email, password: password);
    if (user != null && user.isAnonymous) {
      // Keeps the same uid, so existing cases stay owned by this user.
      await user.linkWithCredential(credential);
    } else {
      await _auth.createUserWithEmailAndPassword(
          email: email, password: password);
    }
    final uid = _auth.currentUser!.uid;
    await _db.collection('users').doc(uid).set({
      'email': email,
      'createdAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  }

  @override
  Future<void> signInWithEmail(String email, String password) =>
      _auth.signInWithEmailAndPassword(email: email, password: password);

  @override
  Future<void> sendPasswordResetEmail(String email) async {
    try {
      await _auth.sendPasswordResetEmail(email: email);
    } on FirebaseAuthException catch (error) {
      // Keep account existence private even when Firebase email-enumeration
      // protection is not enabled for this project.
      if (error.code == 'user-not-found') return;
      rethrow;
    }
  }

  @override
  Future<void> signInWithEmailAndClaimCase(
      String email, String password, String caseId) async {
    final current = _auth.currentUser;
    if (current != null && current.isAnonymous) {
      // This callable proves the current guest owns the case and authorizes
      // only the exact email about to authenticate. It must run before
      // signInWithEmailAndPassword replaces the anonymous Firebase identity.
      await _functions
          .httpsCallable('prepareGuestCaseClaim')
          .call<Map<String, dynamic>>({
        'caseId': caseId,
        'targetEmail': email,
      });
    }

    final signedInEmail = _auth.currentUser?.email?.trim().toLowerCase();
    if (_auth.currentUser == null ||
        _auth.currentUser!.isAnonymous ||
        signedInEmail != email.trim().toLowerCase()) {
      await _auth.signInWithEmailAndPassword(email: email, password: password);
    }
    await claimGuestCase(caseId);
  }

  @override
  Future<void> sendEmailLinkAndPrepareCaseClaim({
    required String email,
    required String caseId,
    required String continueUrl,
  }) async {
    final current = _auth.currentUser;
    if (current != null && current.isAnonymous) {
      // Keep the same case-transfer authorization used by password sign-in.
      // The server binds it to this exact email and expires it quickly, so a
      // forwarded link cannot move a guest case to a different account.
      await _functions
          .httpsCallable('prepareGuestCaseClaim')
          .call<Map<String, dynamic>>({
        'caseId': caseId,
        'targetEmail': email,
      });
    }

    await _auth.sendSignInLinkToEmail(
      email: email,
      actionCodeSettings: ActionCodeSettings(
        url: continueUrl,
        handleCodeInApp: true,
      ),
    );
  }

  @override
  bool isEmailSignInLink(String emailLink) =>
      _auth.isSignInWithEmailLink(emailLink);

  @override
  Future<void> signInWithEmailLinkAndClaimCase({
    required String email,
    required String emailLink,
    required String caseId,
  }) async {
    await _auth.signInWithEmailLink(email: email, emailLink: emailLink);
    await claimGuestCase(caseId);
  }

  @override
  Future<void> claimGuestCase(String caseId) async {
    await _functions
        .httpsCallable('claimPreparedGuestCase',
            options: HttpsCallableOptions(timeout: const Duration(minutes: 2)))
        .call<Map<String, dynamic>>({'caseId': caseId});
  }

  @override
  Future<void> signOut() => _auth.signOut();

  @override
  Future<UploadSession> createCaseUploadSession(
      {required bool consentConfirmed}) async {
    await ensureSignedIn();
    final result = await _functions
        .httpsCallable('createCaseUploadSession')
        .call<Map<String, dynamic>>({'consentConfirmed': consentConfirmed});
    return UploadSession(
      caseId: result.data['caseId'] as String,
      uploadPathPrefix: result.data['uploadPathPrefix'] as String,
    );
  }

  @override
  Future<List<String>> uploadSourceFiles(
    UploadSession session,
    List<PickedUpload> files, {
    void Function(double progress)? onProgress,
  }) async {
    final paths = <String>[];
    final totalBytes = files.fold<int>(0, (acc, f) => acc + f.bytes.length);
    var sentBytes = 0;
    final batchId = newUploadBatchId();

    for (final entry in files.asMap().entries) {
      final file = entry.value;
      final objectName = uploadObjectName(
        file.name,
        batchId: batchId,
        index: entry.key,
      );
      final path = '${session.uploadPathPrefix}$objectName';
      final task = _storage.ref(path).putData(
            file.bytes,
            SettableMetadata(contentType: file.mimeType),
          );
      task.snapshotEvents.listen((snap) {
        if (onProgress != null && totalBytes > 0) {
          onProgress(
              (sentBytes + snap.bytesTransferred) / totalBytes.toDouble());
        }
      });
      await task;
      sentBytes += file.bytes.length;
      paths.add(path);
    }
    onProgress?.call(1.0);
    return paths;
  }

  @override
  Future<DenialExtraction> extractDenial(
      String caseId, List<String> filePaths) async {
    final result = await _functions
        .httpsCallable('extractDenialFromUploadedFile',
            options: HttpsCallableOptions(timeout: const Duration(minutes: 5)))
        .call<Map<String, dynamic>>({'caseId': caseId, 'filePaths': filePaths});
    return DenialExtraction.fromJson(
        Map<String, dynamic>.from(result.data['extraction'] as Map));
  }

  @override
  Future<void> saveExtractionEdits(String caseId, DenialExtraction extraction) {
    return _db.collection('cases').doc(caseId).update({
      'extraction': extraction.toJson(),
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  @override
  Future<void> saveGuidedAnswers(String caseId, GuidedAnswers answers) async {
    await _functions
        .httpsCallable('saveGuidedAnswers')
        .call<Map<String, dynamic>>({
      'caseId': caseId,
      'guidedAnswers': answers.toJson(),
    });
  }

  @override
  Future<FreePreview> generateFreePreview(
      String caseId, DenialExtraction current) async {
    final result = await _functions
        .httpsCallable('generateFreePreview',
            options: HttpsCallableOptions(timeout: const Duration(minutes: 2)))
        .call<Map<String, dynamic>>(
            {'caseId': caseId, 'extraction': current.toJson()});
    return FreePreview.fromJson(
        Map<String, dynamic>.from(result.data['preview'] as Map));
  }

  @override
  Future<String?> createCheckoutSession(String caseId,
      {String kind = 'packet'}) async {
    final result = await _functions
        .httpsCallable('createCheckoutSession')
        .call<Map<String, dynamic>>({'caseId': caseId, 'kind': kind});
    return result.data['checkoutUrl'] as String?;
  }

  @override
  Future<void> confirmCheckoutSession(String caseId, String sessionId) async {
    await _functions
        .httpsCallable('confirmCheckoutSession')
        .call<Map<String, dynamic>>({
      'caseId': caseId,
      'sessionId': sessionId,
    });
  }

  @override
  Future<void> recordCaseFunnelEvent(String caseId, String event) async {
    await _functions
        .httpsCallable('recordCaseFunnelEvent')
        .call<Map<String, dynamic>>({'caseId': caseId, 'event': event});
  }

  @override
  Future<void> recordCaseTierSelection(String caseId, String kind) async {
    await _functions
        .httpsCallable('recordCaseTierSelection')
        .call<Map<String, dynamic>>({'caseId': caseId, 'kind': kind});
  }

  @override
  Future<void> saveCaseAcquisitionAttribution(
      String caseId, String source) async {
    await _functions
        .httpsCallable('saveCaseAcquisitionAttribution')
        .call<Map<String, dynamic>>({'caseId': caseId, 'source': source});
  }

  @override
  Future<void> saveCaseFeedback(
    String caseId, {
    required String satisfaction,
    required String outcome,
    required bool testimonialPermission,
  }) async {
    await _functions
        .httpsCallable('saveCaseFeedback')
        .call<Map<String, dynamic>>({
      'caseId': caseId,
      'satisfaction': satisfaction,
      'outcome': outcome,
      'testimonialPermission': testimonialPermission,
    });
  }

  @override
  Future<void> saveReminderEmail(String caseId, String email) async {
    await _functions
        .httpsCallable('saveReminderEmail')
        .call<Map<String, dynamic>>({'caseId': caseId, 'email': email});
  }

  @override
  Future<AppealPacket> generateAppealPacket(String caseId) async {
    final result = await _functions
        .httpsCallable('generateAppealPacket',
            options: HttpsCallableOptions(timeout: const Duration(minutes: 5)))
        .call<Map<String, dynamic>>({'caseId': caseId});
    return AppealPacket.fromJson(
        Map<String, dynamic>.from(result.data['packet'] as Map));
  }

  @override
  Stream<AppealCase?> watchCase(String caseId) {
    return _db.collection('cases').doc(caseId).snapshots().map((snap) =>
        snap.exists ? AppealCase.fromJson(snap.id, snap.data()!) : null);
  }

  @override
  Future<AppealCase?> getCase(String caseId) async {
    final snap = await _db.collection('cases').doc(caseId).get();
    return snap.exists ? AppealCase.fromJson(snap.id, snap.data()!) : null;
  }

  @override
  Future<List<AppealCase>> listMyCases() async {
    final uid = await ensureSignedIn();
    final query = await _db
        .collection('cases')
        .where('ownerUid', isEqualTo: uid)
        .orderBy('updatedAt', descending: true)
        .limit(50)
        .get();
    return query.docs.map((d) => AppealCase.fromJson(d.id, d.data())).toList();
  }

  @override
  Future<void> saveCase(String caseId) async {
    await _functions
        .httpsCallable('saveCase')
        .call<Map<String, dynamic>>({'caseId': caseId});
  }

  @override
  Future<bool> updateCaseTracker(String caseId, CaseTracker tracker) async {
    final result = await _functions
        .httpsCallable('updateCaseTracker')
        .call<Map<String, dynamic>>({
      'caseId': caseId,
      'caseTracker': tracker.toJson(),
    });
    return result.data['reminderScheduled'] as bool? ?? false;
  }

  @override
  Future<void> deleteCaseAndFiles(String caseId) async {
    await _functions
        .httpsCallable('deleteCaseAndFiles')
        .call<Map<String, dynamic>>({'caseId': caseId});
  }

  @override
  Future<void> deleteAccount() async {
    await _functions
        .httpsCallable('deleteAccount',
            options: HttpsCallableOptions(timeout: const Duration(minutes: 9)))
        .call<Map<String, dynamic>>();
    // The server already deleted the Auth user; drop the local session too.
    await _auth.signOut();
  }

  @override
  Future<List<String>> addFilesToCase(
    String caseId,
    List<PickedUpload> files, {
    void Function(double progress)? onProgress,
  }) async {
    final uid = await ensureSignedIn();
    // Same uid-scoped prefix createCaseUploadSession hands out, so the
    // existing Storage rules apply unchanged.
    final session = UploadSession(
      caseId: caseId,
      uploadPathPrefix: 'tempCases/$uid/$caseId/source/',
    );
    final paths =
        await uploadSourceFiles(session, files, onProgress: onProgress);
    await _db.collection('cases').doc(caseId).update({
      'sourceFilePaths': FieldValue.arrayUnion(paths),
      'updatedAt': FieldValue.serverTimestamp(),
    });
    return paths;
  }

  @override
  Future<void> saveUserAdditions(String caseId, String text) {
    return _db.collection('cases').doc(caseId).update({
      'userAdditions': text,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  @override
  Future<FollowUpRound> generateFollowUp(
    String caseId, {
    required String outcome,
    required String notes,
  }) async {
    final result = await _functions
        .httpsCallable('generateFollowUp',
            options: HttpsCallableOptions(timeout: const Duration(minutes: 5)))
        .call<Map<String, dynamic>>(
            {'caseId': caseId, 'outcome': outcome, 'notes': notes});
    return FollowUpRound.fromJson(
        Map<String, dynamic>.from(result.data['followUp'] as Map));
  }

  @override
  Future<String?> createFollowUpCheckout(String caseId,
      {required String kind}) async {
    final result = await _functions
        .httpsCallable('createCheckoutSession')
        .call<Map<String, dynamic>>({'caseId': caseId, 'kind': kind});
    return result.data['checkoutUrl'] as String?;
  }
}
