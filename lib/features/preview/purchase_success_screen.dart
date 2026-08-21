import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme.dart';
import '../../models/appeal_case.dart';
import '../../state/providers.dart';
import '../../widgets/app_scaffold.dart';

/// Landing page after Stripe checkout. It observes the authoritative payment
/// and packet-generation state, then opens the completed packet.
class PurchaseSuccessScreen extends ConsumerStatefulWidget {
  const PurchaseSuccessScreen({
    super.key,
    required this.caseId,
    this.sessionId,
  });

  final String caseId;
  final String? sessionId;

  @override
  ConsumerState<PurchaseSuccessScreen> createState() =>
      _PurchaseSuccessScreenState();
}

class _PurchaseSuccessScreenState extends ConsumerState<PurchaseSuccessScreen> {
  bool _generating = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _confirmReturnedCheckout();
    });
  }

  Future<void> _confirmReturnedCheckout() async {
    final sessionId = widget.sessionId;
    if (sessionId == null || sessionId.isEmpty) return;
    try {
      await ref
          .read(backendProvider)
          .confirmCheckoutSession(widget.caseId, sessionId);
    } catch (_) {
      // Stripe's webhook and scheduled reconciliation remain authoritative.
      // Keep observing the case instead of showing a false payment failure.
    } finally {
      if (mounted) ref.invalidate(caseStreamProvider(widget.caseId));
    }
  }

  void _refreshPaymentStatus() {
    _confirmReturnedCheckout();
    ref.invalidate(caseStreamProvider(widget.caseId));
  }

  Future<void> _generateThenGo(AppealCase appealCase) async {
    if (_generating || appealCase.packet != null) {
      if (appealCase.packet != null && mounted) {
        context.go('/case/${widget.caseId}/packet');
      }
      return;
    }
    if (!mounted) return;
    setState(() {
      _generating = true;
      _error = null;
    });
    try {
      await ref.read(backendProvider).generateAppealPacket(widget.caseId);
      if (mounted) context.go('/case/${widget.caseId}/packet');
    } catch (error) {
      final message = error.toString().toLowerCase();
      if (message.contains('aborted') ||
          message.contains('already being prepared') ||
          message.contains('another case task')) {
        // A payment-triggered background worker already owns generation.
        return;
      }
      if (mounted) {
        setState(() {
          _error = 'Your purchase is safe, but packet generation stopped. '
              'Please retry.';
          _generating = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final caseAsync = ref.watch(caseStreamProvider(widget.caseId));

    return AppScaffold(
      title: 'Thank you',
      showPrimaryAction: false,
      child: caseAsync.when(
        loading: () => const _GenerationStatusCard(
          progress: null,
          stage: 'Loading your case…',
        ),
        error: (_, __) => ErrorRetry(
          message: 'Could not load your case. Please refresh.',
          onRetry: () => ref.invalidate(caseStreamProvider(widget.caseId)),
        ),
        data: (appealCase) {
          if (appealCase == null) {
            return const _GenerationStatusCard(
              progress: null,
              stage: 'Loading your case…',
            );
          }
          if (_error != null) {
            return ErrorRetry(
              message: _error!,
              onRetry: () => _generateThenGo(appealCase),
            );
          }
          final generationFailed = appealCase.paid &&
              appealCase.packet == null &&
              appealCase.status == CaseStatus.error;
          if (generationFailed && !_generating) {
            return ErrorRetry(
              message: 'Your purchase is safe, but packet drafting stopped '
                  'before it finished. Try again to resume it.',
              onRetry: () => _generateThenGo(appealCase),
            );
          }
          if (appealCase.paid) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              _generateThenGo(appealCase);
            });
            final done = appealCase.packet != null;
            return _GenerationStatusCard(
              progress: done ? 1.0 : appealCase.generationProgress,
              stage: done
                  ? 'Ready — opening your packet…'
                  : generationFailed
                      ? 'Retrying packet generation…'
                      : (appealCase.generationStage ??
                          'Preparing your appeal packet…'),
              paymentConfirmed: true,
              onOpenSavedCases: () => context.go('/account'),
            );
          }
          return _GenerationStatusCard(
            progress: null,
            stage:
                'Waiting for payment confirmation. This can take a few seconds.',
            onRefresh: _refreshPaymentStatus,
            onOpenSavedCases: () => context.go('/account'),
          );
        },
      ),
    );
  }
}

/// A light, stable status surface that distinguishes payment from drafting.
class _GenerationStatusCard extends StatelessWidget {
  const _GenerationStatusCard({
    required this.progress,
    required this.stage,
    this.paymentConfirmed = false,
    this.onRefresh,
    this.onOpenSavedCases,
  });

  final double? progress;
  final String stage;
  final bool paymentConfirmed;
  final VoidCallback? onRefresh;
  final VoidCallback? onOpenSavedCases;

  @override
  Widget build(BuildContext context) {
    final normalizedProgress = progress?.clamp(0.0, 1.0);
    final reduceMotion =
        MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    final complete = normalizedProgress == 1.0;
    final progressValue = normalizedProgress == null
        ? 'In progress'
        : '${(normalizedProgress * 100).round()} percent';
    return Semantics(
      container: true,
      liveRegion: true,
      label: paymentConfirmed ? 'Payment confirmed. $stage' : stage,
      value: progressValue,
      hint: paymentConfirmed
          ? 'You may leave this page. Generation continues on your account.'
          : 'Refresh checks the existing payment status.',
      child: ExcludeSemantics(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 560),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(28),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(AppRadii.lg),
                  border: Border.all(color: AppColors.border),
                  boxShadow: AppShadows.subtle,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 64,
                      height: 64,
                      decoration: BoxDecoration(
                        color: paymentConfirmed
                            ? AppColors.accentTint
                            : AppColors.primaryTint,
                        borderRadius: BorderRadius.circular(AppRadii.md),
                      ),
                      child: Icon(
                        paymentConfirmed
                            ? Icons.verified_user_outlined
                            : Icons.receipt_long_outlined,
                        size: 34,
                        color: paymentConfirmed
                            ? AppColors.accentBright
                            : AppColors.primaryDark,
                      ),
                    ),
                    const SizedBox(height: 18),
                    Text(
                      paymentConfirmed
                          ? 'Payment confirmed'
                          : 'Checking your payment',
                      style: const TextStyle(
                        fontSize: 26,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      stage,
                      style: const TextStyle(
                        fontSize: 17,
                        height: 1.5,
                        color: AppColors.textSecondary,
                      ),
                    ),
                    if (onRefresh != null || onOpenSavedCases != null) ...[
                      const SizedBox(height: 18),
                      Wrap(
                        spacing: 10,
                        runSpacing: 10,
                        children: [
                          if (onRefresh != null)
                            FilledButton.icon(
                              onPressed: onRefresh,
                              icon: const Icon(Icons.refresh_rounded),
                              label: const Text('Refresh status'),
                            ),
                          if (onOpenSavedCases != null)
                            OutlinedButton.icon(
                              onPressed: onOpenSavedCases,
                              icon: const Icon(Icons.folder_open_outlined),
                              label: const Text('My saved cases'),
                            ),
                        ],
                      ),
                    ],
                    const SizedBox(height: 22),
                    if (normalizedProgress == null && reduceMotion)
                      Container(
                        height: 10,
                        decoration: BoxDecoration(
                          color: AppColors.border,
                          borderRadius: BorderRadius.circular(999),
                        ),
                      )
                    else
                      LinearProgressIndicator(
                        value: normalizedProgress,
                        minHeight: 10,
                        borderRadius: BorderRadius.circular(999),
                        backgroundColor: AppColors.border,
                        color: AppColors.accent,
                      ),
                    if (normalizedProgress != null) ...[
                      const SizedBox(height: 8),
                      Text(
                        complete
                            ? 'Packet ready'
                            : '${(normalizedProgress * 100).round()}% complete',
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: AppColors.textSecondary,
                        ),
                      ),
                    ],
                    const SizedBox(height: 22),
                    _StatusRow(
                      complete: paymentConfirmed,
                      active: !paymentConfirmed,
                      label: 'Payment confirmation',
                    ),
                    _StatusRow(
                      complete: complete,
                      active: paymentConfirmed && !complete,
                      label: 'Prepare appeal packet',
                    ),
                    _StatusRow(
                      complete: complete,
                      active: false,
                      label: 'Open and review every page',
                    ),
                    const SizedBox(height: 16),
                    Text(
                      paymentConfirmed
                          ? 'You may safely leave this page. Work continues on your account, and the packet will appear in My saved cases.'
                          : 'Stripe confirmation can take a few seconds. Refreshing checks this payment; it does not start a new checkout.',
                      style: const TextStyle(
                        fontSize: 16,
                        height: 1.5,
                        color: AppColors.textMuted,
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

class _StatusRow extends StatelessWidget {
  const _StatusRow({
    required this.complete,
    required this.active,
    required this.label,
  });

  final bool complete;
  final bool active;
  final String label;

  @override
  Widget build(BuildContext context) {
    final color =
        complete || active ? AppColors.accentBright : AppColors.textMuted;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            complete
                ? Icons.check_circle_outline_rounded
                : active
                    ? Icons.radio_button_checked_rounded
                    : Icons.radio_button_unchecked_rounded,
            size: 22,
            color: color,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                fontSize: 16,
                fontWeight:
                    active || complete ? FontWeight.w700 : FontWeight.w500,
                color: color,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
