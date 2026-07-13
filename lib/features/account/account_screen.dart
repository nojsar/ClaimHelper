import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/theme.dart';
import '../../models/appeal_case.dart';
import '../../state/providers.dart';
import '../../widgets/app_scaffold.dart';

/// Saved cases + account. We only prompt for account creation here (or at
/// purchase/save time), never on first launch.
class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    final casesAsync = ref.watch(myCasesProvider);

    return AppScaffold(
      title: 'My cases',
      child: RefreshIndicator(
        onRefresh: () async => ref.invalidate(myCasesProvider),
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            if (auth.isAnonymous)
              _AccountPrompt()
            else
              _AccountCard(email: auth.email),
            const SizedBox(height: 20),
            const Text('Saved & recent cases',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            casesAsync.when(
              loading: () => Padding(
                padding: const EdgeInsets.all(24),
                child: Center(
                  child: Semantics(
                    liveRegion: true,
                    label: 'Loading your saved cases',
                    child: const CircularProgressIndicator(),
                  ),
                ),
              ),
              error: (e, _) => ErrorRetry(
                message: 'Could not load your cases.',
                onRetry: () => ref.invalidate(myCasesProvider),
              ),
              data: (cases) => cases.isEmpty
                  ? _EmptyCases()
                  : Column(
                      children: [
                        for (final c in cases) _CaseTile(appealCase: c)
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AccountPrompt extends ConsumerStatefulWidget {
  @override
  ConsumerState<_AccountPrompt> createState() => _AccountPromptState();
}

class _AccountPromptState extends ConsumerState<_AccountPrompt> {
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

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final auth = ref.read(authProvider.notifier);
      if (_signInMode) {
        await auth.signIn(_email.text.trim(), _password.text);
      } else {
        await auth.createAccount(_email.text.trim(), _password.text);
      }
      ref.invalidate(myCasesProvider);
    } catch (_) {
      setState(() =>
          _error = 'Could not ${_signInMode ? 'sign in' : 'create account'}. '
              'Check your details and try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(_signInMode ? 'Sign in' : 'Create an account to save cases',
                style:
                    const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            const Text(
              'You can browse and generate a preview without an account. Save '
              'and restore packets by creating one.',
              style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(labelText: 'Email'),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _password,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'Password'),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Semantics(
                liveRegion: true,
                label: 'Error: ${_error!}',
                child: ExcludeSemantics(
                  child: Text(_error!,
                      style: const TextStyle(color: AppColors.error)),
                ),
              ),
            ],
            const SizedBox(height: 16),
            Wrap(
              spacing: 12,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                FilledButton(
                  onPressed: _busy ? null : _submit,
                  child: Text(_busy
                      ? 'Please wait…'
                      : (_signInMode ? 'Sign in' : 'Create account')),
                ),
                TextButton(
                  onPressed: () => setState(() => _signInMode = !_signInMode),
                  child: Text(
                      _signInMode ? 'Need an account?' : 'Already have one?'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _AccountCard extends ConsumerWidget {
  const _AccountCard({this.email});
  final String? email;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Card(
      child: ListTile(
        leading: const Icon(Icons.account_circle, color: AppColors.primary),
        title: Text(email ?? 'Signed in'),
        subtitle: const Text('Your cases are saved to this account.'),
        trailing: TextButton(
          onPressed: () async {
            await ref.read(authProvider.notifier).signOut();
            ref.invalidate(myCasesProvider);
          },
          child: const Text('Sign out'),
        ),
      ),
    );
  }
}

class _CaseTile extends StatelessWidget {
  const _CaseTile({required this.appealCase});
  final AppealCase appealCase;

  String _route() {
    if (appealCase.packet != null) return '/case/${appealCase.id}/packet';
    if (appealCase.paid) return '/case/${appealCase.id}/purchase-success';
    if (appealCase.preview != null) return '/case/${appealCase.id}/preview';
    return '/case/${appealCase.id}/review';
  }

  @override
  Widget build(BuildContext context) {
    final ex = appealCase.extraction;
    final updated = appealCase.updatedAt;
    return Card(
      child: ListTile(
        leading: Icon(
          appealCase.paid
              ? Icons.workspace_premium
              : Icons.description_outlined,
          color: appealCase.paid ? AppColors.accent : AppColors.primary,
        ),
        title: Text(ex?.deniedItem ?? 'Denial case',
            maxLines: 1, overflow: TextOverflow.ellipsis),
        subtitle: Text([
          ex?.insurerName,
          appealCase.status.wire,
          if (updated != null) DateFormat.yMMMd().format(updated),
        ].whereType<String>().join(' · ')),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => context.go(_route()),
      ),
    );
  }
}

class _EmptyCases extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 32),
      child: Column(
        children: [
          const Icon(Icons.folder_open,
              size: 40, color: AppColors.textSecondary),
          const SizedBox(height: 12),
          const Text('No cases yet',
              style: TextStyle(color: AppColors.textSecondary)),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: () => context.go('/upload'),
            icon: const Icon(Icons.add),
            label: const Text('Start an appeal'),
          ),
        ],
      ),
    );
  }
}
