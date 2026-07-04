import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/constants.dart';
import '../../core/theme.dart';
import '../../widgets/app_scaffold.dart';

class LandingScreen extends StatelessWidget {
  const LandingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width > 720;
    return AppScaffold(
      maxWidth: 900,
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 16),
            Text(
              AppCopy.tagline,
              style: TextStyle(
                fontSize: wide ? 34 : 26,
                fontWeight: FontWeight.w800,
                height: 1.2,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              AppCopy.subTagline,
              style: TextStyle(fontSize: 16, color: AppColors.textSecondary),
            ),
            const SizedBox(height: 28),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                FilledButton.icon(
                  onPressed: () => context.go('/upload'),
                  icon: const Icon(Icons.upload_file),
                  label: const Text('Start appeal packet'),
                ),
                OutlinedButton.icon(
                  onPressed: () => context.go('/account'),
                  icon: const Icon(Icons.folder_open),
                  label: const Text('My saved cases'),
                ),
              ],
            ),
            const SizedBox(height: 36),
            _HowItWorks(),
            const SizedBox(height: 32),
            _TrustCard(),
            const SizedBox(height: 24),
            _DisclaimerBlock(),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }
}

class _HowItWorks extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    const steps = [
      ('Upload', 'Add your denial letter, EOB, or prior-auth denial.',
          Icons.file_upload_outlined),
      ('Review', 'We pull out the key facts — you check and correct them.',
          Icons.fact_check_outlined),
      ('Answer', 'A few quick questions tailor your appeal.',
          Icons.quiz_outlined),
      ('Get your packet', 'Appeal letter, checklist, call script, and PDF.',
          Icons.description_outlined),
    ];
    return LayoutBuilder(builder: (context, c) {
      final cols = c.maxWidth > 680 ? 4 : (c.maxWidth > 360 ? 2 : 1);
      return GridView.count(
        crossAxisCount: cols,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: 12,
        crossAxisSpacing: 12,
        childAspectRatio: 1.15,
        children: [
          for (final (title, desc, icon) in steps)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Icon(icon, color: AppColors.primary),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                fontWeight: FontWeight.w700, fontSize: 15)),
                        const SizedBox(height: 4),
                        Text(desc,
                            maxLines: 3,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                fontSize: 12.5,
                                color: AppColors.textSecondary)),
                      ],
                    ),
                  ],
                ),
              ),
            ),
        ],
      );
    });
  }
}

class _TrustCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: const [
                Icon(Icons.lock_outline, color: AppColors.accent),
                SizedBox(width: 8),
                Text('Your privacy',
                    style:
                        TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
              ],
            ),
            const SizedBox(height: 12),
            for (final b in AppCopy.privacyBullets)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
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
    );
  }
}

class _DisclaimerBlock extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF7ED),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFFED7AA)),
      ),
      child: const Text(
        AppCopy.disclaimer,
        style: TextStyle(fontSize: 12.5, color: AppColors.warning),
      ),
    );
  }
}
