import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/constants.dart';
import '../../core/theme.dart';
import '../../state/providers.dart';
import '../../widgets/app_scaffold.dart';

/// Settings & privacy: full disclaimer, delete-all-data, export data, and the
/// mock-mode indicator when running without Firebase.
class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  bool _deleting = false;
  bool _deletingAccount = false;

  Future<void> _deleteAccount() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete your account?'),
        content: const Text(
          'This permanently deletes your account, every case, and all '
          'uploaded files from our servers, and signs you out. Purchase '
          'receipts are kept only as required by accounting law. This '
          'cannot be undone. If you have many saved cases, deletion may take '
          'a few minutes; keep this tab open until it finishes.',
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.error),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete my account'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _deletingAccount = true);
    try {
      await ref.read(backendProvider).deleteAccount();
      ref.invalidate(myCasesProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Your account and all your data have been '
                'deleted.')));
        context.go('/');
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Could not delete your account. Please retry or '
                'email support@getmyyes.com.')));
      }
    } finally {
      if (mounted) setState(() => _deletingAccount = false);
    }
  }

  Future<void> _deleteAll() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete all your data?'),
        content: const Text(
          'This permanently deletes every case and all uploaded files from '
          'our servers. This cannot be undone.',
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.error),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete everything'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _deleting = true);
    try {
      final backend = ref.read(backendProvider);
      final cases = await backend.listMyCases();
      for (final c in cases) {
        await backend.deleteCaseAndFiles(c.id);
      }
      ref.invalidate(myCasesProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('All your data has been deleted.')));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Could not delete everything. Please retry.')));
      }
    } finally {
      if (mounted) setState(() => _deleting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      title: 'Settings & privacy',
      child: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          if (runningInMockMode) _MockBanner(),
          _settingsHeading('Your data'),
          const SizedBox(height: 12),
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.download_outlined),
                  title: const Text('Export my data'),
                  subtitle: const Text(
                      'Download your saved cases and packets as PDFs from each '
                      'packet screen.'),
                  onTap: () => context.go('/account'),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: _deleting
                      ? Semantics(
                          liveRegion: true,
                          label: 'Deleting all data',
                          child: SizedBox(
                              width: 24,
                              height: 24,
                              child: CircularProgressIndicator(strokeWidth: 2)),
                        )
                      : const Icon(Icons.delete_forever_outlined,
                          color: AppColors.error),
                  title: const Text('Delete all data',
                      style: TextStyle(color: AppColors.error)),
                  subtitle: const Text(
                      'Remove every case and uploaded file permanently.'),
                  onTap: _deleting ? null : _deleteAll,
                ),
                const Divider(height: 1),
                ListTile(
                  leading: _deletingAccount
                      ? Semantics(
                          liveRegion: true,
                          label: 'Deleting account',
                          child: SizedBox(
                              width: 24,
                              height: 24,
                              child: CircularProgressIndicator(strokeWidth: 2)),
                        )
                      : const Icon(Icons.person_off_outlined,
                          color: AppColors.error),
                  title: const Text('Delete my account',
                      style: TextStyle(color: AppColors.error)),
                  subtitle: const Text(
                      'Erase your account, cases, and files, and sign out. '
                      'Cannot be undone.'),
                  onTap: _deletingAccount ? null : _deleteAccount,
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          _settingsHeading('Privacy'),
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final b in AppCopy.privacyBullets)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(Icons.check_circle_outline,
                              size: 18, color: AppColors.accent),
                          const SizedBox(width: 8),
                          Expanded(child: Text(b)),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
          _settingsHeading('Disclaimer'),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.warningTint,
              borderRadius: BorderRadius.circular(10),
              border:
                  Border.all(color: AppColors.warning.withValues(alpha: 0.35)),
            ),
            child: const Text(AppCopy.disclaimer,
                style: TextStyle(fontSize: 13, color: AppColors.warning)),
          ),
          const SizedBox(height: 24),
          _settingsHeading('Legal'),
          const SizedBox(height: 12),
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.description_outlined),
                  title: const Text('Terms of Service'),
                  trailing: const Icon(Icons.open_in_new, size: 18),
                  onTap: () => launchUrl(Uri.parse(AppUrls.terms)),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.privacy_tip_outlined),
                  title: const Text('Privacy Policy'),
                  trailing: const Icon(Icons.open_in_new, size: 18),
                  onTap: () => launchUrl(Uri.parse(AppUrls.privacy)),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.accessibility_new_outlined),
                  title: const Text('Accessibility statement'),
                  trailing: const Icon(Icons.open_in_new, size: 18),
                  onTap: () => launchUrl(Uri.parse(AppUrls.accessibility)),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.mail_outline),
                  title: const Text('Contact support'),
                  subtitle: const Text('support@getmyyes.com'),
                  onTap: () =>
                      launchUrl(Uri.parse('mailto:support@getmyyes.com')),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          const Center(
            child: Text('GetMyYes · U.S. only at launch',
                style: TextStyle(color: AppColors.textSecondary, fontSize: 12)),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

Widget _settingsHeading(String text) => Semantics(
      header: true,
      child: Text(text,
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
    );

class _MockBanner extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 20),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.primaryTint,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.borderStrong),
      ),
      child: Row(
        children: const [
          Icon(Icons.science_outlined, color: AppColors.primary),
          SizedBox(width: 8),
          Expanded(
            child: Text(
              'Running in demo mode with mocked AI and payments. No Firebase '
              'project or OpenAI key is used.',
              style: TextStyle(fontSize: 12.5, color: AppColors.textSecondary),
            ),
          ),
        ],
      ),
    );
  }
}
