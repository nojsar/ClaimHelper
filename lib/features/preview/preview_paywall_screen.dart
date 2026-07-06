import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/constants.dart';
import '../../core/theme.dart';
import '../../models/packet.dart';
import '../../services/backend.dart';
import '../../state/intake_controller.dart';
import '../../state/providers.dart';
import '../../widgets/account_gate.dart';
import '../../widgets/app_scaffold.dart';

/// Free preview + paywall. Generates the preview from the confirmed
/// extraction, lets the user supply anything the preview flagged as missing
/// (text details and/or more documents), then locks the full packet behind
/// the one-time purchase.
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

  // "Add the missing pieces" state.
  final _detailsCtrl = TextEditingController();
  final List<PickedUpload> _extraFiles = [];
  bool _updating = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _detailsCtrl.dispose();
    super.dispose();
  }

  String _friendlyError(Object e) {
    final text = e.toString();
    if (text.contains('Preview limit reached')) {
      // Surface the server's message (includes minutes until the window resets).
      return text.substring(text.indexOf('Preview limit reached'));
    }
    return 'Couldn\'t build your preview. Please retry.';
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final intake = ref.read(intakeControllerProvider);
      final backend = ref.read(backendProvider);
      var ex = intake.extraction;

      if (ex == null) {
        // Deep link / refresh: recover from the stored case instead of
        // dead-ending. Reuse a stored preview without burning a rate slot.
        final c = await backend.getCase(widget.caseId);
        ex = c?.extraction;
        if (ex == null) {
          setState(() {
            _error = 'We lost your document session. Please upload again.';
            _loading = false;
          });
          return;
        }
        if (c?.preview != null) {
          setState(() {
            _preview = c!.preview;
            _loading = false;
          });
          return;
        }
      }
      final preview = await backend.generateFreePreview(widget.caseId, ex);
      setState(() {
        _preview = preview;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = _friendlyError(e);
        _loading = false;
      });
    }
  }

  static String _mimeFor(String name) {
    final ext = name.split('.').last.toLowerCase();
    switch (ext) {
      case 'pdf':
        return 'application/pdf';
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'webp':
        return 'image/webp';
      case 'heic':
        return 'image/heic';
      default:
        return 'application/octet-stream';
    }
  }

  Future<void> _pickExtraFiles() async {
    final result = await FilePicker.platform.pickFiles(
      allowMultiple: true,
      withData: true,
      type: FileType.custom,
      allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic'],
    );
    if (result == null) return;
    setState(() {
      _extraFiles.addAll(result.files.where((f) => f.bytes != null).map(
          (f) => PickedUpload(
              name: f.name, bytes: f.bytes!, mimeType: _mimeFor(f.name))));
    });
  }

  Future<void> _applyAdditions() async {
    final details = _detailsCtrl.text.trim();
    if (details.isEmpty && _extraFiles.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content:
              Text('Add some details or attach a document first.')));
      return;
    }
    setState(() => _updating = true);
    try {
      final backend = ref.read(backendProvider);

      if (details.isNotEmpty) {
        await backend.saveUserAdditions(widget.caseId, details);
      }

      var ex = ref.read(intakeControllerProvider).extraction ??
          (await backend.getCase(widget.caseId))?.extraction;

      if (_extraFiles.isNotEmpty) {
        await backend.addFilesToCase(widget.caseId, List.of(_extraFiles));
        final c = await backend.getCase(widget.caseId);
        final allPaths = c?.sourceFilePaths ?? const <String>[];
        // Re-read every source document so the new ones join the extraction.
        ex = await backend.extractDenial(widget.caseId, allPaths);
      }

      if (ex == null) {
        throw StateError('missing extraction');
      }
      final preview =
          await backend.generateFreePreview(widget.caseId, ex);
      if (!mounted) return;
      setState(() {
        _preview = preview;
        _extraFiles.clear();
        _detailsCtrl.clear();
      });
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Preview updated with your additions.')));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(_friendlyError(e))));
      }
    } finally {
      if (mounted) setState(() => _updating = false);
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
            if (p.missingInfo.isNotEmpty) ...[
              const SizedBox(height: 20),
              _MissingPiecesCard(
                detailsCtrl: _detailsCtrl,
                files: _extraFiles,
                updating: _updating,
                onPickFiles: _pickExtraFiles,
                onRemoveFile: (f) => setState(() => _extraFiles.remove(f)),
                onApply: _applyAdditions,
              ),
            ],
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
                      color: AppColors.accentTint,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(preview.amountAtStake!,
                        style: const TextStyle(
                            color: AppColors.accentBright,
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

/// Lets the user supply the facts and documents the preview said were
/// missing — free-text details plus extra uploads — and refresh the preview.
class _MissingPiecesCard extends StatelessWidget {
  const _MissingPiecesCard({
    required this.detailsCtrl,
    required this.files,
    required this.updating,
    required this.onPickFiles,
    required this.onRemoveFile,
    required this.onApply,
  });

  final TextEditingController detailsCtrl;
  final List<PickedUpload> files;
  final bool updating;
  final VoidCallback onPickFiles;
  final void Function(PickedUpload) onRemoveFile;
  final VoidCallback onApply;

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
                Icon(Icons.playlist_add_rounded, color: AppColors.primaryDark),
                SizedBox(width: 8),
                Expanded(
                  child: Text('Add the missing pieces',
                      style:
                          TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                ),
              ],
            ),
            const SizedBox(height: 6),
            const Text(
              'Know any of the items above? Type them here or attach the '
              'documents — your preview (and later your packet) will use them.',
              style: TextStyle(color: AppColors.textSecondary, height: 1.45),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: detailsCtrl,
              maxLines: 4,
              minLines: 3,
              decoration: const InputDecoration(
                hintText: 'e.g. Claim number CLM-123456, date of service '
                    '2026-05-14, I already tried metformin for 3 months…',
              ),
            ),
            const SizedBox(height: 12),
            if (files.isNotEmpty) ...[
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final f in files)
                    Chip(
                      label: Text(f.name,
                          style: const TextStyle(fontSize: 12.5)),
                      onDeleted: updating ? null : () => onRemoveFile(f),
                    ),
                ],
              ),
              const SizedBox(height: 12),
            ],
            Row(
              children: [
                OutlinedButton.icon(
                  onPressed: updating ? null : onPickFiles,
                  icon: const Icon(Icons.attach_file_rounded, size: 18),
                  label: const Text('Attach documents'),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: updating ? null : onApply,
                    icon: updating
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: Colors.white))
                        : const Icon(Icons.refresh_rounded, size: 18),
                    label: Text(
                        updating ? 'Updating preview…' : 'Update my preview'),
                  ),
                ),
              ],
            ),
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
    '${Pricing.freeFollowUpRounds} follow-up rounds when the insurer replies',
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
                    color: AppColors.primaryDark),
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
                        color: AppColors.primaryDark)),
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
            const SizedBox(height: 10),
            const Text(
              'One-time payment · no subscription · '
              'includes ${Pricing.freeFollowUpRounds} follow-up rounds',
              style: TextStyle(fontSize: 12.5, color: AppColors.textMuted),
            ),
          ],
        ),
      ),
    );
  }
}
