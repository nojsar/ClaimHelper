import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/theme.dart';
import '../state/providers.dart';

/// Gates a sensitive action (checkout, save case) behind a real account.
///
/// Anonymous sessions are linked to the new email/password credential, which
/// keeps the same uid — so the current case (and anything already paid on it)
/// stays owned by the user. Existing-account sign-in uses a short-lived,
/// server-authorized ownership transfer instead of abandoning the guest case.
/// Returns true once the user is non-anonymous and owns [caseId].
Future<bool> ensureAccount(
  BuildContext context,
  WidgetRef ref, {
  required String caseId,
  required String title,
  required String reason,
}) async {
  if (!ref.read(authProvider).isAnonymous) {
    try {
      // Usually this is an inexpensive already-owned check. It also repairs a
      // prepared claim after a network interruption or browser reload.
      await ref.read(authProvider.notifier).claimGuestCase(caseId);
      ref.invalidate(caseStreamProvider(caseId));
      ref.invalidate(myCasesProvider);
      return true;
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text(
              'Could not attach this case to your account. Please try again.'),
        ));
      }
      return false;
    }
  }
  await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
    ),
    builder: (_) => _AccountSheet(caseId: caseId, title: title, reason: reason),
  );
  final ready = !ref.read(authProvider).isAnonymous;
  if (ready) {
    // Firestore listeners opened under the anonymous token can terminate when
    // ownership changes; recreate them with the destination account token.
    ref.invalidate(caseStreamProvider(caseId));
    ref.invalidate(myCasesProvider);
  }
  return ready;
}

class _AccountSheet extends ConsumerStatefulWidget {
  const _AccountSheet(
      {required this.caseId, required this.title, required this.reason});
  final String caseId;
  final String title;
  final String reason;

  @override
  ConsumerState<_AccountSheet> createState() => _AccountSheetState();
}

class _AccountSheetState extends ConsumerState<_AccountSheet> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _signInMode = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  String _friendlyError(Object e) {
    if (e is FirebaseAuthException) {
      switch (e.code) {
        case 'email-already-in-use':
        case 'credential-already-in-use':
          return 'That email already has an account. Use "Already have an '
              'account?" to sign in instead.';
        case 'invalid-email':
          return 'That email address doesn\'t look right.';
        case 'weak-password':
          return 'Please pick a stronger password (at least 6 characters).';
        case 'wrong-password':
        case 'invalid-credential':
        case 'user-not-found':
          return 'Email or password is incorrect.';
        case 'too-many-requests':
          return 'Too many attempts — please wait a moment and try again.';
      }
    }
    if (e is FirebaseFunctionsException) {
      switch (e.code) {
        case 'deadline-exceeded':
          return 'The secure transfer expired. Please sign in again.';
        case 'permission-denied':
        case 'failed-precondition':
          return 'We could not attach this guest case to that account. '
              'Please try again.';
        case 'unavailable':
        case 'internal':
          return 'You are signed in, but the case transfer was interrupted. '
              'Try again to finish it safely.';
      }
    }
    return 'Something went wrong. Please try again.';
  }

  Future<void> _submit() async {
    final email = _email.text.trim();
    final password = _password.text;
    if (email.isEmpty || !email.contains('@') || password.length < 6) {
      setState(() => _error =
          'Enter a valid email and a password of at least 6 characters.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final auth = ref.read(authProvider.notifier);
      if (_signInMode) {
        await auth.signInAndClaimCase(email, password, widget.caseId);
      } else {
        await auth.createAccount(email, password);
      }
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      setState(() => _error = _friendlyError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final viewInsets = MediaQuery.of(context).viewInsets.bottom;
    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(24, 24, 24, 24 + viewInsets),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.verified_user_rounded, color: AppColors.primary),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  _signInMode ? 'Sign in' : widget.title,
                  style: const TextStyle(
                      fontSize: 19, fontWeight: FontWeight.w800),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(widget.reason,
              style: const TextStyle(
                  fontSize: 13.5,
                  color: AppColors.textSecondary,
                  height: 1.45)),
          if (_signInMode) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppColors.warningTint,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Text(
                'This case and its uploaded documents will be securely moved '
                'from the guest session to the account you sign in to.',
                style: TextStyle(fontSize: 12.5, color: AppColors.warning),
              ),
            ),
          ],
          const SizedBox(height: 18),
          TextField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.next,
            autofillHints: const [AutofillHints.email],
            decoration: const InputDecoration(labelText: 'Email'),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _password,
            obscureText: true,
            textInputAction: TextInputAction.done,
            autofillHints: [
              _signInMode ? AutofillHints.password : AutofillHints.newPassword,
            ],
            onSubmitted: (_) => _busy ? null : _submit(),
            decoration:
                const InputDecoration(labelText: 'Password (6+ characters)'),
          ),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Semantics(
              liveRegion: true,
              label: 'Error: ${_error!}',
              child: ExcludeSemantics(
                child: Text(_error!,
                    style:
                        const TextStyle(color: AppColors.error, fontSize: 13)),
              ),
            ),
          ],
          const SizedBox(height: 18),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _busy ? null : _submit,
              child: Text(_busy
                  ? 'Please wait…'
                  : (_signInMode ? 'Sign in' : 'Create account & continue')),
            ),
          ),
          const SizedBox(height: 6),
          Center(
            child: TextButton(
              onPressed: _busy
                  ? null
                  : () => setState(() {
                        _signInMode = !_signInMode;
                        _error = null;
                      }),
              child: Text(_signInMode
                  ? 'New here? Create an account'
                  : 'Already have an account? Sign in'),
            ),
          ),
        ],
      ),
    );
  }
}
