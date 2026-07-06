import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/constants.dart';
import '../../core/theme.dart';
import '../../models/packet.dart';
import '../../state/intake_controller.dart';
import '../../state/providers.dart';
import '../../widgets/account_gate.dart';
import '../../widgets/app_scaffold.dart';

/// Free preview + paywall. Generates the preview from the confirmed
/// extraction, then locks the full packet behind the $39 purchase.
class PreviewPaywallScreen extends ConsumerStatefulWidget {
  const PreviewPaywallScreen({super.key, required this.caseId});
  final String caseId;

  @override
  ConsumerState<PreviewPaywallScreen> createState() =>
      _PreviewPaywallScreenState();
}

class _PreviewPaywallScreenState
    extends ConsumerState<PreviewPaywallScreen> {
  FreePreview? _preview;
  bool _loading = true;
  bool _purchasing = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final intake = ref.read(intakeControllerProvider);
      final backend = ref.read(backendProvider);
      final ex = intake.extraction;
      if (ex == null) {
        setState(() {
          _error = 'We lost your document session. Please upload again.';
          _loading = false;
        });
        return;
      }
      final preview = await backend.generateFreePreview(widget.caseId, ex);
      setState(() {
        _preview = preview;
        _loading = false;
      });
    } catch (_) {
      setState(() {
        _error = 'Couldn\'t build your preview. Please retry.';
        _loading = false;
      });
    }
  }

  Future<void> _purchase() async {
    // A purchase must belong to a real account: otherwise the paid packet
    // lives on an unrecoverable anonymous session. Linking keeps the same
    // uid, so this case stays owned by the user.
    if (ref.read(authProvider).isAnonymous) {
      final ok = await ensureAccount(
        context,
        ref,
        title: 'Create your account first',
        reason: 'Your paid appeal packet is stored on your account so you can '
            'come back to it from any device. This takes 20 seconds, then '
            'checkout continues.',
      );
      if (!ok || !mounted) return;
    }
    setState(() => _purchasing = true);
    try {
      final backend = ref.read(backendProvider);
      final url = await backend.createCheckoutSession(widget.caseId);
      if (url != null) {
        // Web: redirect to Stripe Checkout.
        await launchUrl(Uri.parse(url), webOnlyWindowName: '_self');
      } else {
        // Mock/dev: payment resolved instantly; go to success page.
        if (mounted) context.go('/case/${widget.caseId}/purchase-success');
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Checkout could not start. Please try again.')));
      }
    } finally {
      if (mounted) setState(() => _purchasing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const AppScaffold(
        title: 'Your preview',
        child: Center(child: CircularProgressIndicator()),
      );
    }
    if (_error != null) {
      return AppScaffold(
        title: 'Your preview',
        child: ErrorRetry(message: _error!, onRetry: _load),
      );
    }
    final p = _preview!;

    return AppScaffold(
      title: 'Your free preview',
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _PreviewCard(preview: p),
            const SizedBox(height: 20),
            _PaywallCard(
              recommended: p.recommendedPacketType,
              purchasing: _purchasing,
              onBuy: _purchase,
            ),
            const SizedBox(height: 16),
            const DisclaimerChip(),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}

class _PreviewCard extends StatelessWidget {
  const _PreviewCard({required this.preview});
  final FreePreview preview;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                if (preview.amountAtStake != null)
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: const Color(0xFFECFDF5),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(preview.amountAtStake!,
                        style: const TextStyle(
                            color: AppColors.accent,
                            fontWeight: FontWeight.w700)),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            const Text('What happened',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
            const SizedBox(height: 6),
            Text(preview.denialSummary),
            const SizedBox(height: 16),
            const Text('Your likely appeal path',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
            const SizedBox(height: 6),
            Text(preview.likelyAppealPath),
            if (preview.missingInfo.isNotEmpty) ...[
              const SizedBox(height: 16),
              const Text('What we still need',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
              const SizedBox(height: 6),
              for (final m in preview.missingInfo)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.radio_button_unchecked,
                          size: 16, color: AppColors.textSecondary),
                      const SizedBox(width: 8),
                      Expanded(child: Text(m)),
                    ],
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

class _PaywallCard extends StatelessWidget {
  const _PaywallCard({
    required this.recommended,
    required this.purchasing,
    required this.onBuy,
  });
  final String recommended;
  final bool purchasing;
  final VoidCallback onBuy;

  static const _includes = [
    'Plain-English denial summary',
    'Appeal letter draft',
    'Evidence checklist',
    'Doctor letter request draft',
    'Insurer call script',
    'Deadline / reminder checklist',
    'PDF export',
  ];

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.workspace_premium_outlined,
                    color: AppColors.primary),
                const SizedBox(width: 8),
                Expanded(
                  child: Text('Full Appeal Packet',
                      style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          color: AppColors.textPrimary)),
                ),
                Text('\$${Pricing.fullPacketUsd}',
                    style: const TextStyle(
                        fontSize: 26,
                        fontWeight: FontWeight.w800,
                        color: AppColors.primary)),
              ],
            ),
            const SizedBox(height: 4),
            Text('Recommended: $recommended',
                style: const TextStyle(color: AppColors.textSecondary)),
            const Divider(height: 24),
            for (final i in _includes)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: Row(
                  children: [
                    const Icon(Icons.check_circle,
                        size: 18, color: AppColors.accent),
                    const SizedBox(width: 8),
                    Expanded(child: Text(i)),
                  ],
                ),
              ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: purchasing ? null : onBuy,
                icon: purchasing
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.lock_open),
                label: Text(purchasing
                    ? 'Starting checkout…'
                    : 'Unlock full packet — \$${Pricing.fullPacketUsd}'),
              ),
            ),
            const SizedBox(height: 12),
            _ComingSoonTier(),
          ],
        ),
      ),
    );
  }
}

class _ComingSoonTier extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: 0.7,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: const Color(0xFFF8FAFC),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(
          children: [
            const Icon(Icons.person_search_outlined,
                color: AppColors.textSecondary),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Appeal Packet + Human Review — \$${Pricing.humanReviewUsd}',
                      style: const TextStyle(fontWeight: FontWeight.w600)),
                  const Text('Coming later',
                      style: TextStyle(
                          fontSize: 12, color: AppColors.textSecondary)),
                ],
              ),
            ),
            const Chip(label: Text('Soon')),
          ],
        ),
      ),
    );
  }
}
