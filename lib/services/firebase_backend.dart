import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';

import '../models/appeal_case.dart';
import '../models/extraction.dart';
import '../models/guided_answers.dart';
import '../models/packet.dart';
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
    final totalBytes =
        files.fold<int>(0, (acc, f) => acc + f.bytes.length);
    var sentBytes = 0;

    for (final file in files) {
      final safeName = file.name.replaceAll(RegExp(r'[^\w.\-]'), '_');
      final path = '${session.uploadPathPrefix}$safeName';
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
        .call<Map<String, dynamic>>(
            {'caseId': caseId, 'filePaths': filePaths});
    return DenialExtraction.fromJson(
        Map<String, dynamic>.from(result.data['extraction'] as Map));
  }

  @override
  Future<void> saveExtractionEdits(
      String caseId, DenialExtraction extraction) {
    return _db.collection('cases').doc(caseId).update({
      'extraction': extraction.toJson(),
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  @override
  Future<void> saveGuidedAnswers(String caseId, GuidedAnswers answers) async {
    await _functions.httpsCallable('saveGuidedAnswers').call<Map<String, dynamic>>({
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
  Future<String?> createCheckoutSession(String caseId) async {
    final result = await _functions
        .httpsCallable('createCheckoutSession')
        .call<Map<String, dynamic>>({'caseId': caseId});
    return result.data['checkoutUrl'] as String?;
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
    return query.docs
        .map((d) => AppealCase.fromJson(d.id, d.data()))
        .toList();
  }

  @override
  Future<void> saveCase(String caseId) async {
    await _functions
        .httpsCallable('saveCase')
        .call<Map<String, dynamic>>({'caseId': caseId});
  }

  @override
  Future<void> deleteCaseAndFiles(String caseId) async {
    await _functions
        .httpsCallable('deleteCaseAndFiles')
        .call<Map<String, dynamic>>({'caseId': caseId});
  }
}
