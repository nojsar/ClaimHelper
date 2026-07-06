import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/theme.dart';
import '../state/providers.dart';

/// Gates a sensitive action (checkout, save case) behind a real account.
///
/// Anonymous sessions are linked to the new email/password credential, which
/// keeps the same uid — so the current case (and anything already paid on it)
/// stays owned by the user. Returns true once the user is non-anonymous.
Future<bool> ensureAccount(
  BuildContext context,
  WidgetRef ref, {
  required String title,
  required String reason,
}) async {
  if (!ref.read(authProvider).isAnonymous) return true;
  await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
    ),
    builder: (_) => _AccountSheet(title: title, reason: reason),
  );
  return !ref.read(authProvider).isAnonymous;
}

class _AccountSheet extends ConsumerStatefulWidget {
  const _AccountSheet({required this.title, required this.reason});
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
        await auth.signIn(email, password);
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
    return Padding(
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
                  fontSize: 13.5, color: AppColors.textSecondary, height: 1.45)),
          if (_signInMode) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppColors.warningTint,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Text(
                'Heads up: signing in to a different account moves you off '
                'this guest session. To keep the case you\'re working on, '
                'create a new account instead.',
                style: TextStyle(fontSize: 12.5, color: AppColors.warning),
              ),
            ),
          ],
          const SizedBox(height: 18),
          TextField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            autofillHints: const [AutofillHints.email],
            decoration: const InputDecoration(labelText: 'Email'),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _password,
            obscureText: true,
            autofillHints: const [AutofillHints.newPassword],
            onSubmitted: (_) => _busy ? null : _submit(),
            decoration: const InputDecoration(
                labelText: 'Password (6+ characters)'),
          ),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!,
                style: const TextStyle(color: AppColors.error, fontSize: 13)),
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
