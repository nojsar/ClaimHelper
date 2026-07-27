import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/theme.dart';
import '../state/providers.dart';

/// Gates a sensitive action (checkout, save case) behind a real account.
///
/// The default is a passwordless email link. Existing email/password accounts
/// remain available as a fallback. Both paths preserve the same short-lived,
/// server-authorized guest-case claim before the anonymous identity changes.
Future<bool> ensureAccount(
  BuildContext context,
  WidgetRef ref, {
  required String caseId,
  required String title,
  required String reason,
  String? resumeCheckoutKind,
}) async {
  if (!ref.read(authProvider).isAnonymous) {
    try {
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
    builder: (_) => _AccountSheet(
      caseId: caseId,
      title: title,
      reason: reason,
      resumeCheckoutKind: resumeCheckoutKind,
    ),
  );
  final ready = !ref.read(authProvider).isAnonymous;
  if (ready) {
    ref.invalidate(caseStreamProvider(caseId));
    ref.invalidate(myCasesProvider);
  }
  return ready;
}

class _AccountSheet extends ConsumerStatefulWidget {
  const _AccountSheet({
    required this.caseId,
    required this.title,
    required this.reason,
    this.resumeCheckoutKind,
  });

  final String caseId;
  final String title;
  final String reason;
  final String? resumeCheckoutKind;

  @override
  ConsumerState<_AccountSheet> createState() => _AccountSheetState();
}

class _AccountSheetState extends ConsumerState<_AccountSheet> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _signInMode = false;
  bool _passwordMode = false;
  bool _busy = false;
  bool _emailLinkSent = false;
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
          return 'That email already has an account. Sign in with a password '
              'or use a secure sign-in link.';
        case 'invalid-email':
          return 'That email address does not look right.';
        case 'weak-password':
          return 'Please pick a stronger password (at least 6 characters).';
        case 'wrong-password':
        case 'invalid-credential':
        case 'user-not-found':
          return 'Email or password is incorrect.';
        case 'expired-action-code':
          return 'That secure sign-in link expired. Send a new one and open it '
              'within 60 minutes.';
        case 'too-many-requests':
          return 'Too many attempts — please wait a moment and try again.';
      }
    }
    if (e is FirebaseFunctionsException) {
      switch (e.code) {
        case 'deadline-exceeded':
          return 'The secure transfer expired. Send a new sign-in link or sign '
              'in with your password.';
        case 'permission-denied':
        case 'failed-precondition':
          return 'We could not attach this guest case to that account. Please '
              'send a new link and try again.';
        case 'unavailable':
        case 'internal':
          return 'The secure transfer was interrupted. Please retry.';
      }
    }
    return 'Something went wrong. Please try again.';
  }

  String _emailLinkContinueUrl() {
    final params = <String, String>{'caseId': widget.caseId};
    if (widget.resumeCheckoutKind != null) {
      params['resumeCheckout'] = widget.resumeCheckoutKind!;
    }
    final route = Uri(path: '/email-link', queryParameters: params).toString();
    final base = Uri.base;
    final origin = (base.scheme == 'https' || base.scheme == 'http')
        ? base.origin
        : 'https://getmyyes.com';
    return '$origin/#$route';
  }

  Future<void> _submit() async {
    final email = _email.text.trim();
    final password = _password.text;
    if (email.isEmpty || !email.contains('@')) {
      setState(() => _error = 'Enter a valid email address.');
      return;
    }
    if (_passwordMode && password.length < 6) {
      setState(() => _error = 'Enter a password with at least 6 characters.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final auth = ref.read(authProvider.notifier);
      if (!_passwordMode) {
        await auth.sendCheckoutEmailLink(
          email: email,
          caseId: widget.caseId,
          continueUrl: _emailLinkContinueUrl(),
        );
        if (mounted) setState(() => _emailLinkSent = true);
      } else if (_signInMode) {
        await auth.signInAndClaimCase(email, password, widget.caseId);
        if (mounted) Navigator.of(context).pop(true);
      } else {
        await auth.createAccount(email, password);
        if (mounted) Navigator.of(context).pop(true);
      }
    } catch (e) {
      if (mounted) setState(() => _error = _friendlyError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final viewInsets = MediaQuery.of(context).viewInsets.bottom;
    final passwordSignIn = _passwordMode && _signInMode;
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
                  passwordSignIn ? 'Sign in' : widget.title,
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
          if (passwordSignIn) ...[
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
          if (_emailLinkSent) ...[
            Semantics(
              container: true,
              liveRegion: true,
              label: 'Secure sign-in link sent',
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.accentTint,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  'Check ${_email.text.trim()} for a secure sign-in link. '
                  'Open it within 60 minutes to continue safely.',
                  style: const TextStyle(fontSize: 13, height: 1.45),
                ),
              ),
            ),
            const SizedBox(height: 12),
          ],
          TextField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            textInputAction:
                _passwordMode ? TextInputAction.next : TextInputAction.done,
            autofillHints: const [AutofillHints.email],
            onSubmitted: _passwordMode || _busy ? null : (_) => _submit(),
            decoration: const InputDecoration(labelText: 'Email'),
          ),
          if (_passwordMode) ...[
            const SizedBox(height: 10),
            TextField(
              controller: _password,
              obscureText: true,
              textInputAction: TextInputAction.done,
              autofillHints: [
                _signInMode
                    ? AutofillHints.password
                    : AutofillHints.newPassword,
              ],
              onSubmitted: (_) => _busy ? null : _submit(),
              decoration:
                  const InputDecoration(labelText: 'Password (6+ characters)'),
            ),
          ],
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
                  : _passwordMode
                      ? (_signInMode ? 'Sign in' : 'Create account & continue')
                      : (_emailLinkSent
                          ? 'Send a new secure link'
                          : 'Send secure sign-in link')),
            ),
          ),
          const SizedBox(height: 6),
          Center(
            child: Column(
              children: [
                TextButton(
                  onPressed: _busy
                      ? null
                      : () => setState(() {
                            _passwordMode = !_passwordMode;
                            _error = null;
                          }),
                  child: Text(_passwordMode
                      ? 'Use a secure sign-in link instead'
                      : 'Prefer a password? Use email and password'),
                ),
                if (_passwordMode)
                  TextButton(
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
              ],
            ),
          ),
        ],
      ),
    );
  }
}
