import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/constants.dart';
import '../models/appeal_case.dart';
import '../services/backend.dart';
import '../services/firebase_backend.dart';
import '../services/mock_backend.dart';
import '../services/pdf_service.dart';

/// The single backend for the app. Swapped for a mock when USE_MOCKS is set
/// (or overridden in tests via ProviderScope overrides).
final backendProvider = Provider<Backend>((ref) {
  if (kUseMocks) return MockBackend();
  return FirebaseBackend();
});

final pdfServiceProvider = Provider<PdfService>((ref) => PdfService());

/// Auth state exposed as a simple snapshot the UI can read.
class AuthSnapshot {
  const AuthSnapshot({required this.signedIn, required this.isAnonymous, this.email});
  final bool signedIn;
  final bool isAnonymous;
  final String? email;
}

final authProvider =
    StateNotifierProvider<AuthController, AuthSnapshot>((ref) {
  return AuthController(ref.watch(backendProvider));
});

class AuthController extends StateNotifier<AuthSnapshot> {
  AuthController(this._backend)
      : super(const AuthSnapshot(signedIn: false, isAnonymous: true)) {
    _init();
  }

  final Backend _backend;

  Future<void> _init() async {
    await _backend.ensureSignedIn();
    _refresh();
  }

  void _refresh() {
    state = AuthSnapshot(
      signedIn: true,
      isAnonymous: _backend.isAnonymous,
      email: _backend.currentEmail,
    );
  }

  Future<void> createAccount(String email, String password) async {
    await _backend.linkWithEmail(email, password);
    _refresh();
  }

  Future<void> signIn(String email, String password) async {
    await _backend.signInWithEmail(email, password);
    _refresh();
  }

  Future<void> signOut() async {
    await _backend.signOut();
    await _backend.ensureSignedIn();
    _refresh();
  }
}

/// Streams a single case document for reactive screens (paywall, packet).
final caseStreamProvider =
    StreamProvider.family<AppealCase?, String>((ref, caseId) {
  return ref.watch(backendProvider).watchCase(caseId);
});

/// The user's saved/active cases for the Account screen.
final myCasesProvider = FutureProvider<List<AppealCase>>((ref) {
  return ref.watch(backendProvider).listMyCases();
});

/// Whether we can even reach a real backend. Used to show a friendly banner
/// when running in mock mode.
bool get runningInMockMode => kUseMocks;

/// Debug flag surfaced in Settings.
bool get isDebugBuild => kDebugMode;
