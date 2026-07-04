import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme.dart';
import '../../models/appeal_case.dart';
import '../../state/providers.dart';
import '../../widgets/app_scaffold.dart';

/// Landing page after Stripe checkout. Waits for the webhook to flip the case
/// to paid, then generates the packet and routes to it. Polls the case stream
/// so it works whether we arrive before or after the webhook fires.
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

class _PurchaseSuccessScreenState
    extends ConsumerState<PurchaseSuccessScreen> {
  bool _generating = false;
  String _status = 'Confirming your payment…';
  String? _error;

  Future<void> _generateThenGo(AppealCase c) async {
    if (_generating || c.packet != null) {
      if (c.packet != null && mounted) {
        context.go('/case/${widget.caseId}/packet');
      }
      return;
    }
    _generating = true;
    setState(() => _status = 'Building your appeal packet…');
    try {
      await ref.read(backendProvider).generateAppealPacket(widget.caseId);
      if (mounted) context.go('/case/${widget.caseId}/packet');
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'Your purchase is safe, but packet generation failed. '
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
      child: caseAsync.when(
        loading: () => _Waiting(status: _status),
        error: (e, _) => ErrorRetry(
          message: 'Could not load your case. Please refresh.',
          onRetry: () => ref.invalidate(caseStreamProvider(widget.caseId)),
        ),
        data: (c) {
          if (c == null) {
            return const _Waiting(status: 'Loading…');
          }
          if (_error != null) {
            return ErrorRetry(
              message: _error!,
              onRetry: () {
                _error = null;
                _generateThenGo(c);
              },
            );
          }
          if (c.paid) {
            // Fire generation once the case is paid.
            WidgetsBinding.instance
                .addPostFrameCallback((_) => _generateThenGo(c));
            return _Waiting(status: _status);
          }
          return const _Waiting(
              status: 'Waiting for payment confirmation… this can take a '
                  'few seconds.');
        },
      ),
    );
  }
}

class _Waiting extends StatelessWidget {
  const _Waiting({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.verified_outlined,
              color: AppColors.accent, size: 48),
          const SizedBox(height: 16),
          const CircularProgressIndicator(),
          const SizedBox(height: 16),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Text(status, textAlign: TextAlign.center),
          ),
        ],
      ),
    );
  }
}
