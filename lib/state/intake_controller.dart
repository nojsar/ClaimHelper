import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/appeal_case.dart';
import '../models/extraction.dart';
import '../models/guided_answers.dart';
import '../services/backend.dart';
import 'providers.dart';

/// Holds the in-flight intake for a single case as the user moves through
/// upload → extraction review → guided questions → preview. Screens read and
/// mutate this; it persists edits to the backend as it goes.
class IntakeState {
  const IntakeState({
    this.caseId,
    this.uploading = false,
    this.uploadProgress = 0,
    this.extracting = false,
    this.restoring = false,
    this.extraction,
    this.guidedAnswers = const GuidedAnswers(),
    this.error,
  });

  final String? caseId;
  final bool uploading;
  final double uploadProgress;
  final bool extracting;
  final bool restoring;
  final DenialExtraction? extraction;
  final GuidedAnswers guidedAnswers;
  final String? error;

  IntakeState copyWith({
    String? caseId,
    bool? uploading,
    double? uploadProgress,
    bool? extracting,
    bool? restoring,
    DenialExtraction? extraction,
    GuidedAnswers? guidedAnswers,
    String? error,
    bool clearError = false,
  }) {
    return IntakeState(
      caseId: caseId ?? this.caseId,
      uploading: uploading ?? this.uploading,
      uploadProgress: uploadProgress ?? this.uploadProgress,
      extracting: extracting ?? this.extracting,
      restoring: restoring ?? this.restoring,
      extraction: extraction ?? this.extraction,
      guidedAnswers: guidedAnswers ?? this.guidedAnswers,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

final intakeControllerProvider =
    StateNotifierProvider<IntakeController, IntakeState>((ref) {
  return IntakeController(ref.watch(backendProvider));
});

class IntakeController extends StateNotifier<IntakeState> {
  IntakeController(this._backend) : super(const IntakeState());

  final Backend _backend;
  Future<void> _guidedSaveTail = Future.value();

  void reset() => state = const IntakeState();

  /// Rehydrates the in-flight case after a refresh or direct link. Firestore
  /// remains authoritative; local state is only a navigation cache.
  Future<AppealCase?> restoreCase(String caseId) async {
    if (state.caseId == caseId &&
        state.extraction != null &&
        !state.restoring) {
      return null;
    }
    state = IntakeState(caseId: caseId, restoring: true);
    try {
      final appealCase = await _backend.getCase(caseId);
      if (appealCase == null) {
        state = IntakeState(
          caseId: caseId,
          error: 'This case is no longer available.',
        );
        return null;
      }
      state = IntakeState(
        caseId: caseId,
        extracting: appealCase.status == CaseStatus.extracting,
        extraction: appealCase.extraction,
        guidedAnswers: appealCase.guidedAnswers ?? const GuidedAnswers(),
      );
      return appealCase;
    } catch (e) {
      state = IntakeState(caseId: caseId, error: _friendly(e));
      rethrow;
    }
  }

  /// Creates the case and uploads files, then kicks off extraction.
  /// Returns the caseId on success.
  Future<String> startUploadAndExtract({
    required bool consentConfirmed,
    required List<PickedUpload> files,
  }) async {
    state =
        state.copyWith(uploading: true, uploadProgress: 0, clearError: true);
    try {
      final session = await _backend.createCaseUploadSession(
          consentConfirmed: consentConfirmed);
      state = state.copyWith(caseId: session.caseId);

      final paths = await _backend.uploadSourceFiles(
        session,
        files,
        onProgress: (p) => state = state.copyWith(uploadProgress: p),
      );

      state = state.copyWith(uploading: false, extracting: true);
      final extraction = await _backend.extractDenial(session.caseId, paths);
      state = state.copyWith(extracting: false, extraction: extraction);
      return session.caseId;
    } catch (e) {
      state = state.copyWith(
          uploading: false, extracting: false, error: _friendly(e));
      rethrow;
    }
  }

  void updateExtraction(DenialExtraction extraction) {
    state = state.copyWith(extraction: extraction);
  }

  Future<void> persistExtraction() async {
    final id = state.caseId;
    final ex = state.extraction;
    if (id == null || ex == null) return;
    await _backend.saveExtractionEdits(id, ex);
  }

  void updateGuidedAnswers(GuidedAnswers answers) {
    state = state.copyWith(guidedAnswers: answers);
  }

  Future<void> persistGuidedAnswers() async {
    final id = state.caseId;
    if (id == null) return;
    final answers = state.guidedAnswers;
    final previous = _guidedSaveTail;
    final operation = () async {
      try {
        await previous;
      } catch (_) {
        // A failed earlier autosave must not block the newest snapshot.
      }
      await _backend.saveGuidedAnswers(id, answers);
    }();
    _guidedSaveTail = operation.catchError((_) {});
    await operation;
  }

  /// Restarts extraction from paths already persisted on the case document.
  Future<DenialExtraction> retryExtraction(
      String caseId, List<String> filePaths) async {
    state = IntakeState(caseId: caseId, extracting: true);
    try {
      final extraction = await _backend.extractDenial(caseId, filePaths);
      state = IntakeState(caseId: caseId, extraction: extraction);
      return extraction;
    } catch (e) {
      state = IntakeState(caseId: caseId, error: _friendly(e));
      rethrow;
    }
  }

  String _friendly(Object e) {
    final msg = e.toString();
    if (msg.contains('unauthenticated')) {
      return 'Please wait a moment and try again — securing your session.';
    }
    return 'Something went wrong. Please check your connection and retry.';
  }
}
