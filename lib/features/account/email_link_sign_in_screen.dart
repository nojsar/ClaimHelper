import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme.dart';
import '../../state/providers.dart';
import '../../widgets/app_scaffold.dart';

/// Finishes a Firebase passwordless email-link sign-in and then consumes the
/// guest-case claim prepared before the link was sent. The email is re-entered
/// here instead of being persisted in browser storage.
class EmailLinkSignInScreen extends ConsumerStatefulWidget {
  const EmailLinkSignInScreen({
    super.key,
    required this.caseId,
    this.resumeCheckoutKind,
  });

  final String caseId;
  final String? resumeCheckoutKind;

  @override
  ConsumerState<EmailLinkSignInScreen> createState() =>
      _EmailLinkSignInScreenState();
}

class _EmailLinkSignInScreenState extends ConsumerState<EmailLinkSignInScreen> {
  final _email = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  /// Firebase usually puts the action code in the page query. Rebuild a URL
  /// from hash-query parameters when the link reaches the Flutter hash router.
  String _incomingEmailLink() {
    final base = Uri.base;
    if (base.queryParameters.containsKey('oobCode')) return base.toString();
    final fragment = base.fragment;
    final separator = fragment.indexOf('?');
    if (separator < 0) return base.toString();
    final hashQuery = Uri.splitQueryString(fragment.substring(separator + 1));
    if (!hashQuery.containsKey('oobCode')) return base.toString();
    return base.replace(queryParameters: hashQuery, fragment: '').toString();
  }

  String _friendlyError(Object error) {
    final text = error.toString();
    if (text.contains('expired-action-code') ||
        text.contains('deadline-exceeded')) {
      return 'This secure sign-in link expired. Return to your preview and send a new link.';
    }
    if (text.contains('invalid-email') ||
        text.contains('invalid-action-code')) {
      return 'This link or email address is not valid. Return to your preview and request a new link.';
    }
    if (text.contains('permission-denied') ||
        text.contains('failed-precondition')) {
      return 'We could not securely attach this case. Return to your preview and send a new link.';
    }
    return 'We could not complete secure sign-in. Please try again.';
  }

  Future<void> _continue() async {
    final email = _email.text.trim();
    final emailLink = _incomingEmailLink();
    if (widget.caseId.isEmpty) {
      setState(() => _error =
          'This link is missing its case. Return to your preview and request a new link.');
      return;
    }
    if (email.isEmpty || !email.contains('@')) {
      setState(
          () => _error = 'Enter the email address that received the link.');
      return;
    }
    if (!ref.read(authProvider.notifier).isEmailSignInLink(emailLink)) {
      setState(() => _error =
          'This is not a valid secure sign-in link. Return to your preview and request a new one.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(authProvider.notifier).completeEmailLinkSignIn(
            email: email,
            emailLink: emailLink,
            caseId: widget.caseId,
          );
      // The checkout trigger after this route sees a non-anonymous user, so
      // record completion here. This is a fixed aggregate milestone only.
      try {
        await ref
            .read(backendProvider)
            .recordCaseFunnelEvent(widget.caseId, 'account_completed');
      } catch (_) {
        // Analytics must never prevent a customer from accessing checkout.
      }
      if (!mounted) return;
      final kind = widget.resumeCheckoutKind;
      if (kind == 'packet' || kind == 'packet_plus') {
        context.go('/case/${widget.caseId}/preview?resumeCheckout=$kind');
      } else {
        context.go('/case/${widget.caseId}/packet');
      }
    } catch (error) {
      if (mounted) setState(() => _error = _friendlyError(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      title: 'Confirm secure sign-in',
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 460),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Semantics(
                      header: true,
                      child: Text(
                        'Confirm secure sign-in',
                        style: TextStyle(
                            fontSize: 24, fontWeight: FontWeight.w800),
                      ),
                    ),
                    const SizedBox(height: 10),
                    const Text(
                      'Enter the email address that received this link. We use it '
                      'only to verify access to your saved appeal case.',
                      style: TextStyle(
                          color: AppColors.textSecondary, height: 1.45),
                    ),
                    const SizedBox(height: 20),
                    TextField(
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      textInputAction: TextInputAction.done,
                      autofillHints: const [AutofillHints.email],
                      onSubmitted: _busy ? null : (_) => _continue(),
                      decoration: const InputDecoration(
                        labelText: 'Email address',
                        hintText: 'you@email.com',
                      ),
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      Semantics(
                        liveRegion: true,
                        label: 'Error: $_error',
                        child: Text(_error!,
                            style: const TextStyle(
                                color: AppColors.error, fontSize: 13)),
                      ),
                    ],
                    const SizedBox(height: 20),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: _busy ? null : _continue,
                        child:
                            Text(_busy ? 'Confirming…' : 'Continue securely'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
