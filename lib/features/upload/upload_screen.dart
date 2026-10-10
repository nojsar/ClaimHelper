import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/constants.dart';
import '../../core/theme.dart';
import '../../services/analytics.dart';
import '../../services/backend.dart';
import '../../state/intake_controller.dart';
import '../../widgets/app_scaffold.dart';
import '../../widgets/ui.dart';
import 'file_drop.dart';
import 'upload_validation.dart';

class UploadScreen extends ConsumerStatefulWidget {
  const UploadScreen({super.key, this.requestedPurchaseKind});

  /// A fragment-route preference from the public Full Case CTA. It is kept
  /// only in the in-memory intake, never attached to the uploaded case.
  final String? requestedPurchaseKind;

  @override
  ConsumerState<UploadScreen> createState() => _UploadScreenState();
}

class _UploadScreenState extends ConsumerState<UploadScreen> {
  final List<PickedUpload> _files = [];
  bool _consent = false;
  bool _busy = false;
  bool _dragging = false;
  bool _hovering = false;
  bool _documentAddedTracked = false;
  final FileDrop _fileDrop = FileDrop();

  @override
  void initState() {
    super.initState();
    if (widget.requestedPurchaseKind != null) {
      ref
          .read(intakeControllerProvider.notifier)
          .setRequestedPurchaseKind(widget.requestedPurchaseKind);
    }
    // Native browser drag-and-drop (web only; a no-op elsewhere).
    _fileDrop.attach(
      onFiles: _onDroppedFiles,
      onDrag: (dragging) {
        if (mounted && !_busy) setState(() => _dragging = dragging);
      },
    );
  }

  @override
  void dispose() {
    _fileDrop.detach();
    super.dispose();
  }

  String _mimeFor(String name) {
    final ext = name.split('.').last.toLowerCase();
    return switch (ext) {
      'pdf' => 'application/pdf',
      'png' => 'image/png',
      'heic' => 'image/heic',
      'heif' => 'image/heif',
      'webp' => 'image/webp',
      _ => 'image/jpeg',
    };
  }

  UploadFileDescriptor _descriptor(PickedUpload file) => UploadFileDescriptor(
        name: file.name,
        sizeBytes: file.bytes.length,
      );

  /// Adds only valid files. Unsupported, duplicate, over-20 MB, and selections
  /// that would exceed 45 MB are rejected before upload begins.
  void _addAll(Iterable<PickedUpload> incoming) {
    final candidates = incoming.toList(growable: false);
    if (candidates.isEmpty) return;
    final plan = planUploadSelection(
      existing: _files.map(_descriptor).toList(growable: false),
      incoming: candidates.map(_descriptor).toList(growable: false),
    );
    if (plan.acceptedIndexes.isNotEmpty) {
      setState(() {
        for (final index in plan.acceptedIndexes) {
          _files.add(candidates[index]);
        }
      });
      if (!_documentAddedTracked) {
        _documentAddedTracked = true;
        trackDocumentAdded();
      }
    }
    if (plan.rejections.isNotEmpty) {
      _showSelectionIssues(plan.rejections);
    }
  }

  void _showSelectionIssues(List<UploadRejection> issues) {
    if (!mounted) return;
    final first = issues.first.message;
    final extra = issues.length - 1;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(extra == 0
          ? first
          : '$first $extra more file${extra == 1 ? ' was' : 's were'} skipped.'),
    ));
  }

  Future<void> _pickFiles() async {
    final result = await FilePicker.platform.pickFiles(
      allowMultiple: true,
      type: FileType.custom,
      allowedExtensions: allowedUploadExtensions,
      withData: true,
    );
    if (result == null) return;
    _addAll([
      for (final f in result.files)
        if (f.bytes != null)
          PickedUpload(
              name: f.name, bytes: f.bytes!, mimeType: _mimeFor(f.name)),
    ]);
  }

  /// Files dropped onto the page via native browser drag-and-drop.
  void _onDroppedFiles(List<DroppedFile> dropped) {
    if (_busy) return;
    if (mounted) setState(() => _dragging = false);
    _addAll([
      for (final f in dropped)
        PickedUpload(
          name: f.name,
          bytes: f.bytes,
          mimeType: _mimeFor(f.name),
        ),
    ]);
  }

  Future<void> _takePhoto() async {
    try {
      final picker = ImagePicker();
      // image_picker_for_web adds the HTML `capture` attribute. Supported
      // mobile browsers open the camera; others safely fall back to a chooser.
      final shot = await picker.pickImage(
        source: ImageSource.camera,
        preferredCameraDevice: CameraDevice.rear,
      );
      if (shot == null) return;
      final bytes = await shot.readAsBytes();
      _addAll([
        PickedUpload(
          name: shot.name,
          bytes: bytes,
          mimeType: _mimeFor(shot.name),
        ),
      ]);
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text(
          'Camera capture is not available here. Choose an existing photo instead.',
        ),
      ));
    }
  }

  Future<void> _submit() async {
    if (!_consent || _files.isEmpty) return;
    setState(() => _busy = true);
    context.go('/processing');
    try {
      await ref.read(intakeControllerProvider.notifier).startUploadAndExtract(
            consentConfirmed: _consent,
            files: _files,
          );
      final caseId = ref.read(intakeControllerProvider).caseId;
      if (caseId != null && mounted) {
        context.go('/case/$caseId/review');
      }
    } catch (_) {
      // Processing screen shows the error + retry.
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final canSubmit = _consent && _files.isNotEmpty && !_busy;
    final totalBytes =
        _files.fold<int>(0, (sum, file) => sum + file.bytes.length);
    final compact = MediaQuery.sizeOf(context).width < 600;
    final actionHint = _files.isEmpty
        ? 'Add at least one file to continue.'
        : !_consent
            ? 'Confirm consent to continue.'
            : 'Free preview. No card required.';

    return AppScaffold(
      title: 'Upload your denial',
      showPrimaryAction: false,
      child: Column(
        children: [
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(24, 24, 24, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const WorkflowProgress(currentStep: 0),
                  const SizedBox(height: 18),
                  Semantics(
                    header: true,
                    child: const Text(
                      'Upload your denial letter',
                      style: TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.5,
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Choose the denial letter, Explanation of Benefits (EOB), or '
                    'prior-authorization notice. Include every page. A clear photo is okay.',
                    style: TextStyle(
                      color: context.palette.textSecondary,
                      fontSize: 17,
                      height: 1.5,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Accepted: PDF, JPG, PNG, HEIC, or WebP · 20 MB each · 45 MB total.',
                    style: TextStyle(
                      color: context.palette.textSecondary,
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Semantics(
                    button: true,
                    enabled: !_busy,
                    label: _files.isEmpty
                        ? 'Choose denial documents'
                        : 'Add more denial documents',
                    hint:
                        'Accepts PDF, JPG, PNG, HEIC, or WebP. 20 megabytes per file and 45 megabytes total.',
                    excludeSemantics: true,
                    onTap: _busy ? null : _pickFiles,
                    child: InkWell(
                      onTap: _busy ? null : _pickFiles,
                      onHover: (value) => setState(() => _hovering = value),
                      onFocusChange: (value) =>
                          setState(() => _hovering = value),
                      borderRadius: BorderRadius.circular(AppRadii.lg),
                      child: _DropZone(
                        dragging: _dragging,
                        hovering: _hovering,
                        hasFiles: _files.isNotEmpty,
                        compact: compact,
                      ),
                    ),
                  ),
                  if (_files.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          child: Semantics(
                            liveRegion: true,
                            label:
                                '${_files.length} file${_files.length == 1 ? '' : 's'} ready, ${formatUploadBytes(totalBytes)} of 45 megabytes',
                            excludeSemantics: true,
                            child: Text(
                              '${_files.length} file${_files.length == 1 ? '' : 's'} ready - '
                              '${formatUploadBytes(totalBytes)} of 45 MB',
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 14,
                              ),
                            ),
                          ),
                        ),
                        TextButton.icon(
                          onPressed:
                              _busy ? null : () => setState(_files.clear),
                          icon: const Icon(Icons.delete_outline, size: 18),
                          label: const Text('Clear all'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    ..._files.asMap().entries.map((entry) => _FileRow(
                          file: entry.value,
                          onRemove: _busy
                              ? null
                              : () =>
                                  setState(() => _files.removeAt(entry.key)),
                        )),
                  ],
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: _busy ? null : _takePhoto,
                    icon: const Icon(Icons.photo_camera_outlined, size: 18),
                    label: const Text('Take a photo'),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'On supported phones, this opens the rear camera. Otherwise, choose a photo from your device.',
                    style: TextStyle(
                      fontSize: 16,
                      height: 1.45,
                      color: context.palette.textMuted,
                    ),
                  ),
                  const SizedBox(height: 18),
                  const _UploadTrustPanel(),
                  const SizedBox(height: 20),
                  _ConsentBox(
                    value: _consent,
                    onChanged: _busy
                        ? null
                        : (value) => setState(() => _consent = value ?? false),
                  ),
                  const SizedBox(height: 12),
                  const DisclaimerChip(),
                ],
              ),
            ),
          ),
          _UploadActionBar(
            canSubmit: canSubmit,
            busy: _busy,
            hint: actionHint,
            onSubmit: _submit,
          ),
        ],
      ),
    );
  }
}

class _UploadTrustPanel extends StatelessWidget {
  const _UploadTrustPanel();

  static const _items = [
    (
      Icons.lock_outline_rounded,
      'Secure upload',
      'Encrypted in transit and protected by private access rules.'
    ),
    (
      Icons.psychology_alt_outlined,
      'Private processing',
      'Used only to draft your appeal - never to train AI.'
    ),
    (
      Icons.auto_delete_outlined,
      'Automatic deletion',
      'Unsaved uploads are deleted after 24 hours.'
    ),
    (
      Icons.credit_card_off_outlined,
      'Free preview',
      'No card is required before you see your case preview.'
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.palette.accentTint,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadii.md),
        side: BorderSide(color: context.palette.accent.withValues(alpha: 0.32)),
      ),
      clipBehavior: Clip.antiAlias,
      child: ExpansionTile(
        maintainState: true,
        tilePadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 18),
        leading: Icon(Icons.lock_outline_rounded,
            color: context.palette.accentBright, size: 26),
        title: const Text(
          'Your documents stay private',
          style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
        ),
        subtitle: Padding(
          padding: EdgeInsets.only(top: 4),
          child: Text(
            'Encrypted in transit. Never used to train AI. No card is required for the free summary.',
            style: TextStyle(
              fontSize: 16,
              height: 1.45,
              color: context.palette.textSecondary,
            ),
          ),
        ),
        children: [
          LayoutBuilder(
            builder: (context, constraints) {
              final twoColumns = constraints.maxWidth >= 560 &&
                  MediaQuery.textScalerOf(context).scale(16) <= 23;
              final width = twoColumns
                  ? (constraints.maxWidth - 16) / 2
                  : constraints.maxWidth;
              return Semantics(
                container: true,
                label: 'Document privacy and security details',
                explicitChildNodes: true,
                child: Wrap(
                  spacing: 16,
                  runSpacing: 14,
                  children: [
                    for (final item in _items)
                      SizedBox(
                        width: width,
                        child: _TrustItem(
                          icon: item.$1,
                          title: item.$2,
                          text: item.$3,
                        ),
                      ),
                  ],
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _TrustItem extends StatelessWidget {
  const _TrustItem({
    required this.icon,
    required this.title,
    required this.text,
  });

  final IconData icon;
  final String title;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: context.palette.accentBright),
        const SizedBox(width: 8),
        Expanded(
          child: Text.rich(
            TextSpan(
              style: TextStyle(
                color: context.palette.textSecondary,
                fontSize: 16,
                height: 1.5,
              ),
              children: [
                TextSpan(
                  text: '$title: ',
                  style: TextStyle(
                    color: context.palette.textPrimary,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                TextSpan(text: text),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _UploadActionBar extends StatelessWidget {
  const _UploadActionBar({
    required this.canSubmit,
    required this.busy,
    required this.hint,
    required this.onSubmit,
  });

  final bool canSubmit;
  final bool busy;
  final String hint;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(24, 12, 24, 14),
      decoration: BoxDecoration(
        color: context.palette.surface,
        border: Border(top: BorderSide(color: context.palette.border)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 18,
            offset: const Offset(0, -6),
          ),
        ],
      ),
      child: Semantics(
        container: true,
        label: 'Upload action. $hint',
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: canSubmit ? onSubmit : null,
                style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(52),
                ),
                child: Text(
                  busy
                      ? 'Creating your free summary...'
                      : 'Create my free summary',
                  textAlign: TextAlign.center,
                ),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              hint,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 16,
                height: 1.4,
                color: context.palette.textMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The visual drop area. Reacts to hover (mouse) and drag-over states.
class _DropZone extends StatelessWidget {
  const _DropZone({
    required this.dragging,
    required this.hovering,
    required this.hasFiles,
    required this.compact,
  });
  final bool dragging;
  final bool hovering;
  final bool hasFiles;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final active = dragging || hovering;
    final browseLabel = hasFiles ? 'Choose more files' : 'Choose files';
    final reduceMotion =
        MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    return AnimatedContainer(
      duration:
          reduceMotion ? Duration.zero : const Duration(milliseconds: 160),
      curve: Curves.easeOut,
      width: double.infinity,
      padding: EdgeInsets.symmetric(
        vertical: dragging ? (compact ? 40 : 52) : (compact ? 32 : 44),
        horizontal: 20,
      ),
      decoration: BoxDecoration(
        gradient: dragging ? null : context.palette.heroWash,
        color: dragging ? context.palette.primaryTint : null,
        borderRadius: BorderRadius.circular(AppRadii.lg),
        border: Border.all(
          color: active
              ? context.palette.primary
              : context.palette.primary.withValues(alpha: 0.22),
          width: dragging ? 2 : 1.4,
        ),
        boxShadow: active ? context.palette.shadowSoft : null,
      ),
      child: Column(
        children: [
          AnimatedScale(
            scale: dragging ? 1.12 : 1.0,
            duration: reduceMotion
                ? Duration.zero
                : const Duration(milliseconds: 160),
            child: Container(
              width: 60,
              height: 60,
              decoration: BoxDecoration(
                gradient: context.palette.brandGradient,
                borderRadius: BorderRadius.circular(18),
                boxShadow: const [
                  BoxShadow(
                      color: Color(0x442563EB),
                      blurRadius: 18,
                      offset: Offset(0, 8),
                      spreadRadius: -4),
                ],
              ),
              child: Icon(
                  dragging
                      ? Icons.file_download_rounded
                      : Icons.cloud_upload_rounded,
                  size: 30,
                  color: Colors.white),
            ),
          ),
          const SizedBox(height: 14),
          Text(
            dragging
                ? 'Drop your files to add them'
                : compact
                    ? (hasFiles
                        ? 'Add another denial document'
                        : 'Choose a denial document')
                    : (hasFiles
                        ? 'Drag & drop more files'
                        : 'Drag & drop your files here'),
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 10),
          Container(
            constraints: const BoxConstraints(minHeight: 52),
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
            decoration: BoxDecoration(
              color: context.palette.surface,
              borderRadius: BorderRadius.circular(AppRadii.sm),
              border: Border.all(color: context.palette.primary),
            ),
            child: Wrap(
              alignment: WrapAlignment.center,
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 9,
              runSpacing: 4,
              children: [
                Icon(Icons.folder_open_outlined,
                    size: 22, color: context.palette.primaryDark),
                Text(
                  browseLabel,
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                    color: context.palette.primaryDark,
                  ),
                ),
              ],
            ),
          ),
          if (kIsWeb && !compact) ...[
            const SizedBox(height: 8),
            Text(
              'You can also drag files into this area.',
              style:
                  TextStyle(fontSize: 16, color: context.palette.textSecondary),
            ),
          ],
        ],
      ),
    );
  }
}

class _FileRow extends StatelessWidget {
  const _FileRow({required this.file, required this.onRemove});
  final PickedUpload file;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    final isPdf = file.mimeType == 'application/pdf';
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: context.palette.surface,
        borderRadius: BorderRadius.circular(AppRadii.md),
        border: Border.all(color: context.palette.border),
      ),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: (isPdf ? context.palette.accent : context.palette.primary)
                  .withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              isPdf ? Icons.picture_as_pdf_rounded : Icons.image_rounded,
              color: isPdf ? context.palette.accent : context.palette.primary,
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(file.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontWeight: FontWeight.w700, fontSize: 16)),
                Text(formatUploadBytes(file.bytes.length),
                    style: TextStyle(
                        fontSize: 14, color: context.palette.textMuted)),
              ],
            ),
          ),
          Icon(Icons.check_circle_rounded,
              size: 18, color: context.palette.accent),
          if (onRemove != null)
            IconButton(
              icon: const Icon(Icons.close_rounded, size: 18),
              color: context.palette.textMuted,
              onPressed: onRemove,
              tooltip: 'Remove ${file.name}',
            ),
        ],
      ),
    );
  }
}

class _ConsentBox extends StatelessWidget {
  const _ConsentBox({required this.value, required this.onChanged});
  final bool value;
  final ValueChanged<bool?>? onChanged;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.palette.surfaceAlt,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadii.md),
        side: BorderSide(color: context.palette.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: CheckboxListTile(
        value: value,
        onChanged: onChanged,
        controlAffinity: ListTileControlAffinity.leading,
        contentPadding: const EdgeInsets.fromLTRB(10, 10, 14, 10),
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadii.md)),
        title: const Text(
          'I consent to secure document processing',
          style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                AppCopy.consentText,
                style: TextStyle(
                  fontSize: 16,
                  height: 1.5,
                  color: context.palette.textSecondary,
                ),
              ),
              Wrap(
                spacing: 10,
                children: [
                  _legalLink(context, 'Privacy Policy', AppUrls.privacy),
                  _legalLink(context, 'Terms of Service', AppUrls.terms),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  static Widget _legalLink(BuildContext context, String label, String url) {
    return Semantics(
      link: true,
      label: label,
      excludeSemantics: true,
      onTap: () => launchUrl(Uri.parse(url)),
      child: InkWell(
        onTap: () => launchUrl(Uri.parse(url)),
        borderRadius: BorderRadius.circular(4),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minWidth: 48, minHeight: 44),
          child: Align(
            alignment: Alignment.centerLeft,
            child: Text(
              label,
              style: TextStyle(
                fontSize: 16,
                color: context.palette.primaryDark,
                decoration: TextDecoration.underline,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
