import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme.dart';
import '../../state/intake_controller.dart';
import '../../widgets/app_scaffold.dart';
import '../../widgets/case_loader.dart';

/// Shows upload progress, then extraction status, then routes to review.
/// Also handles the error state with a retry back to Upload.
class ProcessingScreen extends ConsumerWidget {
  const ProcessingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(intakeControllerProvider);

    // When extraction finishes, hop to the review screen.
    ref.listen(intakeControllerProvider, (prev, next) {
      if (next.extraction != null && next.caseId != null && !next.extracting) {
        context.go('/case/${next.caseId}/review');
      }
    });

    if (state.error != null) {
      return AppScaffold(
        title: 'Processing',
        child: ErrorRetry(
          message: state.error!,
          onRetry: () => context.go('/upload'),
        ),
      );
    }

    final (label, progress) = switch (state) {
      _ when state.uploading => ('Uploading your documents…', state.uploadProgress),
      _ when state.extracting => ('Reading your document with AI…', null),
      _ => ('Getting things ready…', null),
    };

    return AppScaffold(
      title: 'Processing',
      showChrome: true,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              CaseLoader(
                progress: progress,
                messages: state.uploading
                    ? const ['Filing your documents…', 'Sealing the envelope…']
                    : const [
                        'Reading the fine print…',
                        'Finding the denial reason…',
                        'Extracting every date and number…',
                        'Checking the appeal deadline…',
                      ],
              ),
              const SizedBox(height: 22),
              Text(label,
                  style: const TextStyle(
                      fontSize: 17, fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              const Text(
                'This usually takes 10–30 seconds. Please keep this tab open.',
                textAlign: TextAlign.center,
                style: TextStyle(color: AppColors.textSecondary),
              ),
              if (progress != null) ...[
                const SizedBox(height: 16),
                Text('${(progress * 100).toStringAsFixed(0)}%',
                    style: const TextStyle(color: AppColors.textSecondary)),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
