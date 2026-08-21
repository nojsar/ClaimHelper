import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme.dart';
import '../../models/appeal_case.dart';
import '../../state/intake_controller.dart';
import '../../state/providers.dart';
import '../../widgets/app_scaffold.dart';
import '../../widgets/case_loader.dart';

/// Upload/extraction progress backed by a durable case URL. Once a case ID is
/// available, refreshes restore from Firestore instead of falling into an
/// empty indeterminate state.
class ProcessingScreen extends ConsumerStatefulWidget {
  const ProcessingScreen({super.key, this.caseId});

  final String? caseId;

  @override
  ConsumerState<ProcessingScreen> createState() => _ProcessingScreenState();
}

class _ProcessingScreenState extends ConsumerState<ProcessingScreen> {
  Timer? _slowTimer;
  bool _showRetry = false;
  bool _retryStarted = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final id = widget.caseId;
      if (!mounted || id == null) return;
      final local = ref.read(intakeControllerProvider);
      final activeForThisCase = local.caseId == id &&
          (local.uploading || local.extracting || local.extraction != null);
      if (!activeForThisCase) {
        try {
          await ref.read(intakeControllerProvider.notifier).restoreCase(id);
        } catch (_) {
          // The rendered controller error provides the retry action.
        }
      }
    });
    // The extraction callable may legitimately run for up to five minutes.
    // Do not offer a duplicate model request until that server window passed.
    _slowTimer = Timer(const Duration(minutes: 6), () {
      if (mounted) setState(() => _showRetry = true);
    });
  }

  @override
  void dispose() {
    _slowTimer?.cancel();
    super.dispose();
  }

  void _go(String location) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.go(location);
    });
  }

  Future<void> _retry(String caseId, List<String> paths) async {
    if (_retryStarted || paths.isEmpty) return;
    setState(() {
      _retryStarted = true;
      _showRetry = false;
    });
    try {
      await ref
          .read(intakeControllerProvider.notifier)
          .retryExtraction(caseId, paths);
    } catch (_) {
      // Controller exposes a friendly error below.
    } finally {
      if (mounted) setState(() => _retryStarted = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(intakeControllerProvider);

    ref.listen(intakeControllerProvider, (_, next) {
      if (widget.caseId == null && next.caseId != null) {
        context.go('/case/${next.caseId}/processing');
        return;
      }
      if (next.extraction != null && next.caseId != null && !next.extracting) {
        context.go('/case/${next.caseId}/review');
      }
    });

    final durableId = widget.caseId ?? state.caseId;
    if (durableId == null) {
      if (state.error != null) return _error(state.error!);
      if (!state.uploading && !state.extracting) {
        return _error(
          'This processing link does not include a case. Start the upload '
          'again so we can save your progress safely.',
        );
      }
      return _loader(
        label: state.uploading
            ? 'Uploading your documents…'
            : 'Starting secure processing…',
        progress: state.uploading ? state.uploadProgress : null,
        uploading: state.uploading,
      );
    }

    final caseAsync = ref.watch(caseStreamProvider(durableId));
    return caseAsync.when(
      loading: () => _loader(
        label: state.uploading
            ? 'Uploading your documents…'
            : 'Restoring your document session…',
        progress: state.uploading ? state.uploadProgress : null,
        uploading: state.uploading,
      ),
      error: (_, __) => _error(
        'We could not restore this case. Check your connection and retry.',
        retry: () => ref.invalidate(caseStreamProvider(durableId)),
      ),
      data: (appealCase) => _buildCase(durableId, appealCase, state),
    );
  }

  Widget _buildCase(String caseId, AppealCase? appealCase, IntakeState state) {
    if (appealCase == null) {
      return _error('This case is no longer available.');
    }
    if (appealCase.extraction != null) {
      _go('/case/$caseId/review');
      return _loader(label: 'Opening your extracted details…');
    }
    if (state.error != null || appealCase.status == CaseStatus.error) {
      final paths = appealCase.sourceFilePaths;
      return _error(
        state.error ??
            'We could not read those documents. Try the saved upload again.',
        retry: paths.isEmpty ? null : () => _retry(caseId, paths),
      );
    }

    final processing = state.uploading ||
        state.extracting ||
        appealCase.status == CaseStatus.extracting ||
        _retryStarted;
    if (processing) {
      return _loader(
        label: state.uploading
            ? 'Uploading your documents…'
            : 'Reading your documents with AI…',
        progress: state.uploading ? state.uploadProgress : null,
        uploading: state.uploading,
        retry: _showRetry && appealCase.sourceFilePaths.isNotEmpty
            ? () => _retry(caseId, appealCase.sourceFilePaths)
            : null,
      );
    }

    if (appealCase.sourceFilePaths.isNotEmpty) {
      if (!_retryStarted) {
        _retryStarted = true;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!mounted) return;
          _retryStarted = false;
          _retry(caseId, appealCase.sourceFilePaths);
        });
      }
      return _loader(label: 'Resuming document reading…');
    }

    return _error(
      'The tab closed before the secure upload finished, so there is no saved '
      'document to resume. Please upload it again.',
    );
  }

  Widget _error(String message, {VoidCallback? retry}) => AppScaffold(
        title: 'Processing',
        child: ErrorRetry(
          message: message,
          onRetry: retry ?? () => context.go('/upload'),
        ),
      );

  Widget _loader({
    required String label,
    double? progress,
    bool uploading = false,
    VoidCallback? retry,
  }) {
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
                messages: uploading
                    ? const [
                        'Uploading your documents securely…',
                        'Confirming the upload…',
                      ]
                    : const [
                        'Reviewing the document pages…',
                        'Identifying the denial reason…',
                        'Checking important dates…',
                        'Preparing facts for your review…',
                      ],
              ),
              const SizedBox(height: 22),
              Text(label,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                      fontSize: 17, fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              Text(
                uploading
                    ? 'Keep this tab open until the secure upload finishes.'
                    : 'This usually takes 10–30 seconds. Your case can now be '
                        'restored if the page refreshes.',
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.textSecondary),
              ),
              if (progress != null) ...[
                const SizedBox(height: 16),
                Text('${(progress * 100).toStringAsFixed(0)}%',
                    style: const TextStyle(color: AppColors.textSecondary)),
              ],
              if (retry != null) ...[
                const SizedBox(height: 20),
                OutlinedButton.icon(
                  onPressed: retry,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Still waiting? Try reading again'),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
