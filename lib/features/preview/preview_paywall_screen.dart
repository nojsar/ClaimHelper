import 'dart:ui' show ImageFilter;

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/services.dart' show MaxLengthEnforcement;
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/constants.dart';
import '../../core/theme.dart';
import '../../models/extraction.dart';
import '../../models/packet.dart';
import '../../services/backend.dart';
import '../../state/intake_controller.dart';
import '../../state/providers.dart';
import '../../widgets/account_gate.dart';
import '../../widgets/app_scaffold.dart';
import '../../widgets/case_loader.dart';
import '../../widgets/ui.dart';
import '../upload/upload_validation.dart';

/// Free preview + paywall. Generates the preview from the confirmed
/// extraction, lets the user supply anything the preview flagged as missing
/// (text details and/or more documents), then locks the full packet behind
/// the one-time purchase.
class PreviewPaywallScreen extends ConsumerStatefulWidget {
  const PreviewPaywallScreen({
    super.key,
    required this.caseId,
    this.resumeCheckoutKind,
  });
  final String caseId;
  final String? resumeCheckoutKind;

  @override
  ConsumerState<PreviewPaywallScreen> createState() =>
      _PreviewPaywallScreenState();
}

class _PreviewPaywallScreenState extends ConsumerState<PreviewPaywallScreen> {
  static const _maxAdditionalDetailsLength = 8000;

  FreePreview? _preview;
  DenialExtraction? _extraction;
  bool _loading = true;
  bool _purchasing = false;
  String? _error;

  /// 'packet' or 'packet_plus' — which tier the buy button charges.
  String _selectedKind = 'packet';

  // "Add the missing pieces" state.
  final _detailsCtrl = TextEditingController();
  final List<PickedUpload> _extraFiles = [];
  bool _updating = false;
  String? _extraFileError;

  // Deadline-reminder opt-in state.
  final _reminderCtrl = TextEditingController();
  bool _savingReminder = false;
  bool _reminderSaved = false;
  bool _resumeCheckoutStarted = false;
  String? _acquisitionSource;

  @override
  void initState() {
    super.initState();
    if (ref.read(intakeControllerProvider).requestedPurchaseKind ==
        'packet_plus') {
      _selectedKind = 'packet_plus';
    }
    _load();
  }

  @override
  void dispose() {
    _detailsCtrl.dispose();
    _reminderCtrl.dispose();
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
            _extraction = ex;
            _loading = false;
          });
          _resumeCheckoutAfterEmailLink();
          return;
        }
      }
      final preview = await backend.generateFreePreview(widget.caseId, ex);
      setState(() {
        _preview = preview;
        _extraction = ex;
        _loading = false;
      });
      _resumeCheckoutAfterEmailLink();
    } catch (e) {
      setState(() {
        _error = _friendlyError(e);
        _loading = false;
      });
    }
  }

  void _resumeCheckoutAfterEmailLink() {
    final kind = widget.resumeCheckoutKind;
    if (_resumeCheckoutStarted || (kind != 'packet' && kind != 'packet_plus')) {
      return;
    }
    _resumeCheckoutStarted = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      setState(() => _selectedKind = kind!);
      _purchase();
    });
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
      case 'heif':
        return 'image/heic';
      default:
        return 'application/octet-stream';
    }
  }

  UploadFileDescriptor _descriptor(PickedUpload file) => UploadFileDescriptor(
        name: file.name,
        sizeBytes: file.bytes.length,
      );

  void _addExtraFiles(List<PickedUpload> candidates) {
    if (!mounted || candidates.isEmpty) return;
    final plan = planUploadSelection(
      existing: _extraFiles.map(_descriptor).toList(growable: false),
      incoming: candidates.map(_descriptor).toList(growable: false),
    );
    final firstIssue =
        plan.rejections.isEmpty ? null : plan.rejections.first.message;
    final extraIssues = plan.rejections.length - 1;
    setState(() {
      for (final index in plan.acceptedIndexes) {
        _extraFiles.add(candidates[index]);
      }
      _extraFileError = firstIssue == null
          ? null
          : extraIssues == 0
              ? firstIssue
              : '$firstIssue $extraIssues more '
                  'file${extraIssues == 1 ? ' was' : 's were'} skipped.';
    });
  }

  Future<void> _pickExtraFiles() async {
    final result = await FilePicker.platform.pickFiles(
      allowMultiple: true,
      withData: true,
      type: FileType.custom,
      allowedExtensions: allowedUploadExtensions,
    );
    if (result == null) return;
    if (!mounted) return;
    _addExtraFiles([
      for (final file in result.files)
        if (file.bytes != null)
          PickedUpload(
            name: file.name,
            bytes: file.bytes!,
            mimeType: _mimeFor(file.name),
          ),
    ]);
  }

  Future<void> _applyAdditions() async {
    final rawDetails = _detailsCtrl.text;
    if (rawDetails.length > _maxAdditionalDetailsLength) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content:
            Text('Additional case details must be 8,000 characters or fewer.'),
      ));
      return;
    }
    final details = rawDetails.trim();
    if (details.isEmpty && _extraFiles.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Add some details or attach a document first.')));
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
      final preview = await backend.generateFreePreview(widget.caseId, ex);
      if (!mounted) return;
      setState(() {
        _preview = preview;
        _extraction = ex;
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
    final backend = ref.read(backendProvider);
    // Analytics failures must never interrupt checkout. These calls accept only
    // fixed categories, never document content or free text.
    await _recordFunnelEvent('tier_selected');
    try {
      await backend.recordCaseTierSelection(widget.caseId, _selectedKind);
    } catch (_) {
      // Aggregate telemetry is always best-effort.
    }
    if (_acquisitionSource != null) {
      try {
        await backend.saveCaseAcquisitionAttribution(
            widget.caseId, _acquisitionSource!);
      } catch (_) {}
    }
    if (!mounted) return;
    final wasAnonymous = ref.read(authProvider).isAnonymous;
    if (wasAnonymous) await _recordFunnelEvent('account_gate_shown');
    if (!mounted) return;
    // A purchase must belong to a recoverable account. ensureAccount also
    // completes an interrupted guest-case transfer after a browser reload.
    final ok = await ensureAccount(
      context,
      ref,
      caseId: widget.caseId,
      title: 'Create your account first',
      reason: 'Your paid appeal packet is stored on your account so you can '
          'come back to it from any device. This takes 20 seconds, then '
          'checkout continues.',
      resumeCheckoutKind: _selectedKind,
    );
    if (!ok || !mounted) return;
    if (wasAnonymous) await _recordFunnelEvent('account_completed');
    setState(() => _purchasing = true);
    try {
      final url = await backend.createCheckoutSession(widget.caseId,
          kind: _selectedKind);
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

  Future<void> _recordFunnelEvent(String event) async {
    try {
      await ref
          .read(backendProvider)
          .recordCaseFunnelEvent(widget.caseId, event);
    } catch (_) {
      // Aggregate telemetry is always best-effort.
    }
  }

  Future<void> _saveReminder() async {
    final email = _reminderCtrl.text.trim();
    if (!email.contains('@') || !email.contains('.')) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Enter a valid email address.')));
      return;
    }
    setState(() => _savingReminder = true);
    try {
      await ref.read(backendProvider).saveReminderEmail(widget.caseId, email);
      if (mounted) setState(() => _reminderSaved = true);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Could not save reminders. Please retry.')));
      }
    } finally {
      if (mounted) setState(() => _savingReminder = false);
    }
  }

  /// Days until the extracted appeal deadline, or null when unknown/past.
  int? get _daysToDeadline {
    final raw = _extraction?.appealDeadline;
    if (raw == null) return null;
    final deadline = DateTime.tryParse(raw);
    if (deadline == null) return null;
    final days = deadline.difference(DateTime.now()).inDays;
    return (days >= 0 && days <= 365) ? days : null;
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const AppScaffold(
        title: 'Your preview',
        child: Center(
          child: CaseLoader(
            messages: [
              'Reading the fine print…',
              'Weighing the denial reason…',
              'Citing their words back…',
              'Opening your appeal letter…',
            ],
          ),
        ),
      );
    }
    if (_error != null) {
      return AppScaffold(
        title: 'Your preview',
        child: ErrorRetry(message: _error!, onRetry: _load),
      );
    }
    final p = _preview!;
    final days = _daysToDeadline;

    return AppScaffold(
      title: 'Your free preview',
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Semantics(
              header: true,
              child: Text(
                'Your free preview',
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800),
              ),
            ),
            const SizedBox(height: 16),
            if (days != null) ...[
              _DeadlineBanner(days: days),
              const SizedBox(height: 16),
            ],
            _PreviewCard(preview: p),
            if (p.letterOpening != null && p.letterOpening!.isNotEmpty) ...[
              const SizedBox(height: 20),
              _LetterTeaserCard(opening: p.letterOpening!),
            ],
            if (p.missingInfo.isNotEmpty) ...[
              const SizedBox(height: 20),
              _MissingPiecesCard(
                detailsCtrl: _detailsCtrl,
                files: _extraFiles,
                fileError: _extraFileError,
                updating: _updating,
                onPickFiles: _pickExtraFiles,
                onRemoveFile: (f) => setState(() {
                  _extraFiles.remove(f);
                  _extraFileError = null;
                }),
                onApply: _applyAdditions,
              ),
            ],
            const SizedBox(height: 20),
            _PaywallCard(
              recommended: p.recommendedPacketType,
              amountAtStake: p.amountAtStake,
              daysToDeadline: days,
              purchasing: _purchasing,
              selectedKind: _selectedKind,
              onSelectKind: (k) => setState(() => _selectedKind = k),
              acquisitionSource: _acquisitionSource,
              onSelectAcquisitionSource: (value) =>
                  setState(() => _acquisitionSource = value),
              onBuy: _purchase,
            ),
            const SizedBox(height: 20),
            _ReminderCard(
              controller: _reminderCtrl,
              saving: _savingReminder,
              saved: _reminderSaved,
              daysToDeadline: days,
              onSave: _saveReminder,
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

/// Legitimate urgency: the appeal window from their own denial letter.
class _DeadlineBanner extends StatelessWidget {
  const _DeadlineBanner({required this.days});
  final int days;

  @override
  Widget build(BuildContext context) {
    final urgent = days <= 21;
    final label = days == 0
        ? 'Your appeal deadline is today.'
        : 'Your appeal window closes in $days ${days == 1 ? 'day' : 'days'}.';
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: urgent ? AppColors.primaryTint : AppColors.surfaceAlt,
        borderRadius: BorderRadius.circular(AppRadii.md),
        border: Border.all(
            color: urgent ? AppColors.primary : AppColors.borderStrong,
            width: urgent ? 1.2 : 0.8),
      ),
      child: Row(
        children: [
          Icon(Icons.timer_outlined,
              size: 20,
              color: urgent ? AppColors.primaryDark : AppColors.textSecondary),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              '$label Filing on time keeps every appeal level open.',
              style: TextStyle(
                fontWeight: FontWeight.w600,
                color: urgent ? AppColors.primaryDark : AppColors.textPrimary,
              ),
            ),
          ),
        ],
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
            if (preview.amountAtStake != null)
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: AppColors.accentTint,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  preview.amountAtStake!,
                  softWrap: true,
                  style: const TextStyle(
                    color: AppColors.accentBright,
                    fontWeight: FontWeight.w700,
                  ),
                ),
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

/// The strongest conversion moment: the real opening of THEIR appeal letter,
/// already citing the insurer's language back — then the page fades and
/// blurs into the paywall.
class _LetterTeaserCard extends StatelessWidget {
  const _LetterTeaserCard({required this.opening});
  final String opening;

  @override
  Widget build(BuildContext context) {
    final teaserBottomPadding =
        MediaQuery.textScalerOf(context).scale(46).clamp(46.0, 110.0);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: const [
                Icon(Icons.history_edu_outlined, color: AppColors.primaryDark),
                SizedBox(width: 8),
                Expanded(
                  child: Text('Your appeal letter is already started',
                      style:
                          TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Stack(
              children: [
                Container(
                  width: double.infinity,
                  padding: EdgeInsets.fromLTRB(18, 18, 18, teaserBottomPadding),
                  decoration: BoxDecoration(
                    color: AppColors.surfaceAlt,
                    borderRadius: BorderRadius.circular(AppRadii.sm),
                    border: Border.all(color: AppColors.borderStrong),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        opening,
                        style: const TextStyle(
                            fontFamily: AppFonts.serif,
                            fontSize: 15.5,
                            height: 1.65),
                      ),
                      const SizedBox(height: 14),
                      // The cut-off: blurred ghost lines standing in for the
                      // rest of the letter.
                      ClipRect(
                        child: ImageFiltered(
                          imageFilter: ImageFilter.blur(sigmaX: 4, sigmaY: 4),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              for (final w in const [0.95, 0.88, 0.97, 0.6])
                                Padding(
                                  padding:
                                      const EdgeInsets.symmetric(vertical: 5),
                                  child: FractionallySizedBox(
                                    widthFactor: w,
                                    child: Container(
                                        height: 9,
                                        color: AppColors.textSecondary
                                            .withValues(alpha: 0.5)),
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    decoration: BoxDecoration(
                      borderRadius: const BorderRadius.vertical(
                          bottom: Radius.circular(AppRadii.sm)),
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          AppColors.surfaceAlt.withValues(alpha: 0),
                          AppColors.surfaceAlt,
                        ],
                      ),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: const [
                        Icon(Icons.lock_outline,
                            size: 15, color: AppColors.textSecondary),
                        SizedBox(width: 6),
                        Flexible(
                          child: Text(
                            'The full letter is in your packet',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                                fontSize: 12.5,
                                fontWeight: FontWeight.w600,
                                color: AppColors.textSecondary),
                          ),
                        ),
                      ],
                    ),
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

/// Lets the user supply the facts and documents the preview said were
/// missing — free-text details plus extra uploads — and refresh the preview.
class _MissingPiecesCard extends StatelessWidget {
  const _MissingPiecesCard({
    required this.detailsCtrl,
    required this.files,
    required this.fileError,
    required this.updating,
    required this.onPickFiles,
    required this.onRemoveFile,
    required this.onApply,
  });

  final TextEditingController detailsCtrl;
  final List<PickedUpload> files;
  final String? fileError;
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
              maxLength: _PreviewPaywallScreenState._maxAdditionalDetailsLength,
              maxLengthEnforcement: MaxLengthEnforcement.enforced,
              decoration: const InputDecoration(
                labelText: 'Additional case details',
                alignLabelWithHint: true,
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
                      label:
                          Text(f.name, style: const TextStyle(fontSize: 12.5)),
                      onDeleted: updating ? null : () => onRemoveFile(f),
                    ),
                ],
              ),
              const SizedBox(height: 12),
            ],
            if (fileError != null) ...[
              Semantics(
                container: true,
                liveRegion: true,
                label: 'File error: $fileError',
                child: ExcludeSemantics(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(
                        Icons.error_outline,
                        size: 18,
                        color: AppColors.error,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          fileError!,
                          style: const TextStyle(
                            color: AppColors.error,
                            fontSize: 13,
                            height: 1.4,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
            ],
            ResponsiveActions(
              children: [
                OutlinedButton.icon(
                  onPressed: updating ? null : onPickFiles,
                  icon: const Icon(Icons.attach_file_rounded, size: 18),
                  label: const Text('Attach documents'),
                ),
                FilledButton.icon(
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
              ],
            ),
            const SizedBox(height: 6),
            const Text(
              'PDF, JPG, PNG, HEIC, or WebP — 20 MB each, 45 MB total.',
              style: TextStyle(fontSize: 12, color: AppColors.textMuted),
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
    required this.amountAtStake,
    required this.daysToDeadline,
    required this.purchasing,
    required this.selectedKind,
    required this.onSelectKind,
    required this.acquisitionSource,
    required this.onSelectAcquisitionSource,
    required this.onBuy,
  });
  final String recommended;
  final String? amountAtStake;
  final int? daysToDeadline;
  final bool purchasing;
  final String selectedKind;
  final ValueChanged<String> onSelectKind;
  final String? acquisitionSource;
  final ValueChanged<String?> onSelectAcquisitionSource;
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
    final plus = selectedKind == 'packet_plus';
    final price = plus ? Pricing.fullCaseUsd : Pricing.fullPacketUsd;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // The anchor: their number vs. ours.
            if (amountAtStake != null) ...[
              Container(
                width: double.infinity,
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(
                  color: AppColors.accentTint,
                  borderRadius: BorderRadius.circular(AppRadii.sm),
                ),
                child: Text.rich(
                  TextSpan(
                    style: const TextStyle(fontSize: 14.5, height: 1.5),
                    children: [
                      const TextSpan(text: 'On the table: '),
                      TextSpan(
                          text: amountAtStake!,
                          style: const TextStyle(
                              fontWeight: FontWeight.w800,
                              color: AppColors.accentBright)),
                      TextSpan(
                          text:
                              '. The complete appeal packet costs \$$price — once, ever.'),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
            ],
            Text('Recommended: $recommended',
                style: const TextStyle(color: AppColors.textSecondary)),
            const SizedBox(height: 14),
            _TierOption(
              selected: !plus,
              title: 'Full Appeal Packet',
              price: Pricing.fullPacketUsd,
              caption:
                  'Everything below, plus ${Pricing.freeFollowUpRounds} follow-up '
                  'rounds when the insurer replies.',
              onTap: purchasing ? null : () => onSelectKind('packet'),
            ),
            const SizedBox(height: 10),
            _TierOption(
              selected: plus,
              title:
                  'Full Case — up to ${Pricing.fullCaseRoundsCap} follow-up drafts',
              price: Pricing.fullCaseUsd,
              caption:
                  'Everything in the packet, plus up to ${Pricing.fullCaseRoundsCap} '
                  'follow-up drafting rounds for later insurer responses. It costs '
                  '\$${Pricing.fullCaseUpgradeUsd} more than the packet today; a '
                  'packet customer can make that same optional upgrade later. You '
                  'review and send each document; no appeal outcome is promised.',
              onTap: purchasing ? null : () => onSelectKind('packet_plus'),
            ),
            const Divider(height: 26),
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
            DropdownButtonFormField<String>(
              initialValue: acquisitionSource,
              isExpanded: true,
              decoration: const InputDecoration(
                labelText: 'How did you hear about us? (optional)',
                helperText:
                    'A fixed category only — never a link, name, or case detail.',
              ),
              items: const [
                DropdownMenuItem(value: 'google', child: Text('Google search')),
                DropdownMenuItem(value: 'quora', child: Text('Quora')),
                DropdownMenuItem(value: 'social', child: Text('Social media')),
                DropdownMenuItem(
                    value: 'friend_family', child: Text('Friend or family')),
                DropdownMenuItem(
                    value: 'advocate_provider',
                    child: Text('Patient advocate or provider')),
                DropdownMenuItem(value: 'other', child: Text('Other')),
                DropdownMenuItem(
                    value: 'prefer_not_to_say',
                    child: Text('Prefer not to say')),
              ],
              onChanged: purchasing ? null : onSelectAcquisitionSource,
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
                    : plus
                        ? 'Unlock full case — \$${Pricing.fullCaseUsd}'
                        : 'Unlock full packet — \$${Pricing.fullPacketUsd}'),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: const [
                Icon(Icons.verified_user_outlined,
                    size: 17, color: AppColors.accent),
                SizedBox(width: 7),
                Expanded(
                  child: Text(
                    '14-day guarantee: if your packet doesn\'t accurately '
                    'address your denial, email us for a full refund.',
                    style: TextStyle(fontSize: 12.5, height: 1.45),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            const Text(
              'Published marketplace data: roughly 4 in 10 appealed denials '
              'are overturned. Fewer than 1 in 100 people ever appeal. '
              'One-time payment · no subscription.',
              style: TextStyle(fontSize: 12.5, color: AppColors.textMuted),
            ),
            const SizedBox(height: 6),
            const Text(
              'Secure Stripe checkout - GetMyYes never sees or stores your card number.',
              style: TextStyle(fontSize: 12.5, color: AppColors.textMuted),
            ),
            const SizedBox(height: 4),
            const Wrap(
              spacing: 10,
              runSpacing: 0,
              children: [
                _PricingLink(
                  label: 'Guarantee details',
                  url: 'https://getmyyes.com/terms#accuracy-guarantee',
                ),
                _PricingLink(
                  label: 'Terms of Service',
                  url: 'https://getmyyes.com/terms',
                ),
                _PricingLink(
                  label: 'Federal-data source',
                  url: 'https://getmyyes.com/insurer-denial-rates',
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _PricingLink extends StatelessWidget {
  const _PricingLink({required this.label, required this.url});

  final String label;
  final String url;

  @override
  Widget build(BuildContext context) {
    void open() => launchUrl(Uri.parse(url), webOnlyWindowName: '_blank');

    return Semantics(
      link: true,
      label: label,
      excludeSemantics: true,
      onTap: open,
      child: InkWell(
        onTap: open,
        borderRadius: BorderRadius.circular(4),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minWidth: 48, minHeight: 44),
          child: Align(
            alignment: Alignment.centerLeft,
            child: Text(
              label,
              style: const TextStyle(
                fontSize: 12,
                color: AppColors.primaryDark,
                fontWeight: FontWeight.w600,
                decoration: TextDecoration.underline,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _TierOption extends StatelessWidget {
  const _TierOption({
    required this.selected,
    required this.title,
    required this.price,
    required this.caption,
    required this.onTap,
  });

  final bool selected;
  final String title;
  final int price;
  final String caption;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final reduceMotion =
        MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    return Semantics(
      container: true,
      button: true,
      inMutuallyExclusiveGroup: true,
      selected: selected,
      enabled: onTap != null,
      label: '$title, \$$price',
      value: selected ? 'Selected' : 'Not selected',
      hint: caption,
      excludeSemantics: true,
      onTap: onTap,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadii.md),
        child: AnimatedContainer(
          duration:
              reduceMotion ? Duration.zero : const Duration(milliseconds: 180),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: selected ? AppColors.primaryTint : AppColors.surface,
            borderRadius: BorderRadius.circular(AppRadii.md),
            border: Border.all(
              color: selected ? AppColors.primaryDark : AppColors.controlBorder,
              width: selected ? 1.6 : 0.8,
            ),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                selected
                    ? Icons.radio_button_checked
                    : Icons.radio_button_unchecked,
                size: 20,
                color:
                    selected ? AppColors.primaryDark : AppColors.textSecondary,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                        style: const TextStyle(
                            fontWeight: FontWeight.w800, fontSize: 15)),
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 8,
                      runSpacing: 4,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Text('\$$price',
                            style: const TextStyle(
                                fontSize: 19,
                                fontWeight: FontWeight.w800,
                                color: AppColors.primaryDark)),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(caption,
                        style: const TextStyle(
                            fontSize: 12.5,
                            height: 1.45,
                            color: AppColors.textSecondary)),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// "Not ready to decide" path: capture the email, send the recap now, and
/// let the server nudge before the deadline. Opt-in by pressing the button.
class _ReminderCard extends StatelessWidget {
  const _ReminderCard({
    required this.controller,
    required this.saving,
    required this.saved,
    required this.daysToDeadline,
    required this.onSave,
  });

  final TextEditingController controller;
  final bool saving;
  final bool saved;
  final int? daysToDeadline;
  final VoidCallback onSave;

  @override
  Widget build(BuildContext context) {
    if (saved) {
      return Semantics(
        container: true,
        liveRegion: true,
        label: 'Reminder saved',
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: const [
                Icon(Icons.mark_email_read_outlined, color: AppColors.accent),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Your private case link and transactional reminders are on. '
                    'Your unpaid case is retained for up to 14 days; we may nudge '
                    'you before the deadline. No marketing. Stop by deleting the case.',
                    style: TextStyle(height: 1.45),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: const [
                Icon(Icons.schedule_send_outlined,
                    color: AppColors.primaryDark, size: 20),
                SizedBox(width: 8),
                Expanded(
                  child: Text('Save a private link to this preview',
                      style:
                          TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              daysToDeadline != null
                  ? 'Optional. We\'ll email this preview and a private case link, '
                      'then send transactional deadline reminders before your '
                      '$daysToDeadline-day window closes. Your unpaid case is '
                      'retained for up to 14 days; this is not marketing.'
                  : 'Optional. We\'ll email this preview and a private case link, '
                      'then send transactional deadline reminders. Your unpaid case '
                      'is retained for up to 14 days; this is not marketing.',
              style: const TextStyle(
                  color: AppColors.textSecondary, height: 1.45, fontSize: 13),
            ),
            const SizedBox(height: 12),
            LayoutBuilder(
              builder: (context, constraints) {
                final stack = constraints.maxWidth < 440 ||
                    MediaQuery.textScalerOf(context).scale(14) > 20;
                final field = TextField(
                  controller: controller,
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.done,
                  autofillHints: const [AutofillHints.email],
                  onSubmitted: saving ? null : (_) => onSave(),
                  decoration: const InputDecoration(
                    labelText: 'Reminder email address',
                    hintText: 'you@email.com',
                    isDense: true,
                  ),
                );
                final button = FilledButton(
                  onPressed: saving ? null : onSave,
                  child: saving
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white))
                      : const Text('Save preview & remind me'),
                );
                if (stack) {
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      field,
                      const SizedBox(height: 10),
                      button,
                    ],
                  );
                }
                return Row(
                  children: [
                    Expanded(child: field),
                    const SizedBox(width: 10),
                    button,
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
