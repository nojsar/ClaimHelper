import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/constants.dart';
import '../../core/theme.dart';
import '../../services/backend.dart';
import '../../state/intake_controller.dart';
import '../../widgets/app_scaffold.dart';
import 'file_drop.dart';

class UploadScreen extends ConsumerStatefulWidget {
  const UploadScreen({super.key});

  @override
  ConsumerState<UploadScreen> createState() => _UploadScreenState();
}

class _UploadScreenState extends ConsumerState<UploadScreen> {
  final List<PickedUpload> _files = [];
  bool _consent = false;
  bool _busy = false;
  bool _dragging = false;
  bool _hovering = false;
  final FileDrop _fileDrop = FileDrop();

  static const _allowedExt = [
    'pdf', 'jpg', 'jpeg', 'png', 'heic', 'heif', 'webp'
  ];

  @override
  void initState() {
    super.initState();
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

  bool _allowed(String name) =>
      _allowedExt.contains(name.split('.').last.toLowerCase());

  /// Adds files, skipping duplicates (by name + size).
  void _addAll(Iterable<PickedUpload> incoming) {
    setState(() {
      for (final f in incoming) {
        if (_files.any((e) => e.name == f.name && e.bytes.length == f.bytes.length)) {
          continue;
        }
        _files.add(f);
      }
    });
  }

  void _rejectedSnack() {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Skipped unsupported file. Use PDF, JPG, PNG, or HEIC.')));
  }

  Future<void> _pickFiles() async {
    final result = await FilePicker.platform.pickFiles(
      allowMultiple: true,
      type: FileType.custom,
      allowedExtensions: _allowedExt,
      withData: true,
    );
    if (result == null) return;
    _addAll([
      for (final f in result.files)
        if (f.bytes != null)
          PickedUpload(name: f.name, bytes: f.bytes!, mimeType: _mimeFor(f.name)),
    ]);
  }

  /// Files dropped onto the page via native browser drag-and-drop.
  void _onDroppedFiles(List<DroppedFile> dropped) {
    if (_busy) return;
    if (mounted) setState(() => _dragging = false);
    final added = <PickedUpload>[];
    var rejected = 0;
    for (final f in dropped) {
      if (!_allowed(f.name)) {
        rejected++;
        continue;
      }
      added.add(PickedUpload(
          name: f.name, bytes: f.bytes, mimeType: _mimeFor(f.name)));
    }
    if (added.isNotEmpty) _addAll(added);
    if (rejected > 0) _rejectedSnack();
  }

  Future<void> _takePhoto() async {
    final picker = ImagePicker();
    final shot = await picker.pickImage(source: ImageSource.camera);
    if (shot == null) return;
    final bytes = await shot.readAsBytes();
    _addAll([
      PickedUpload(name: shot.name, bytes: bytes, mimeType: _mimeFor(shot.name)),
    ]);
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
    final showCamera = !kIsWeb;

    return AppScaffold(
      title: 'Upload your denial',
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Add your documents',
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800,
                    letterSpacing: -0.5)),
            const SizedBox(height: 8),
            const Text(
              'Upload the denial letter, EOB, or prior-authorization denial. '
              'PDF, JPG, PNG, or HEIC. You can add more than one.',
              style: TextStyle(color: AppColors.textSecondary, fontSize: 15),
            ),
            const SizedBox(height: 20),

            // Drop zone — click to browse anywhere; on web you can also drag &
            // drop files onto the page (handled natively by FileDrop).
            MouseRegion(
              cursor: _busy ? MouseCursor.defer : SystemMouseCursors.click,
              onEnter: (_) => setState(() => _hovering = true),
              onExit: (_) => setState(() => _hovering = false),
              child: GestureDetector(
                onTap: _busy ? null : _pickFiles,
                child: _DropZone(
                  dragging: _dragging,
                  hovering: _hovering,
                  hasFiles: _files.isNotEmpty,
                ),
              ),
            ),

            if (_files.isNotEmpty) ...[
              const SizedBox(height: 16),
              Row(
                children: [
                  Text('${_files.length} file${_files.length == 1 ? '' : 's'} added',
                      style: const TextStyle(
                          fontWeight: FontWeight.w700, fontSize: 14)),
                  const Spacer(),
                  TextButton.icon(
                    onPressed: _busy ? null : () => setState(_files.clear),
                    icon: const Icon(Icons.delete_outline, size: 18),
                    label: const Text('Clear all'),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              ..._files.asMap().entries.map((e) => _FileRow(
                    file: e.value,
                    onRemove: _busy
                        ? null
                        : () => setState(() => _files.removeAt(e.key)),
                  )),
            ],

            const SizedBox(height: 12),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                OutlinedButton.icon(
                  onPressed: _busy ? null : _pickFiles,
                  icon: const Icon(Icons.attach_file, size: 18),
                  label: Text(_files.isEmpty ? 'Choose files' : 'Add more files'),
                ),
                if (showCamera)
                  OutlinedButton.icon(
                    onPressed: _busy ? null : _takePhoto,
                    icon: const Icon(Icons.photo_camera_outlined, size: 18),
                    label: const Text('Take a photo'),
                  ),
              ],
            ),

            const SizedBox(height: 20),
            _ConsentBox(
              value: _consent,
              onChanged: _busy
                  ? null
                  : (v) => setState(() => _consent = v ?? false),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: canSubmit ? _submit : null,
                icon: const Icon(Icons.auto_awesome_rounded),
                label: const Text('Read my document'),
              ),
            ),
            const SizedBox(height: 12),
            const DisclaimerChip(),
            const SizedBox(height: 24),
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
  });
  final bool dragging;
  final bool hovering;
  final bool hasFiles;

  @override
  Widget build(BuildContext context) {
    final active = dragging || hovering;
    final browseHint = kIsWeb ? 'or click to browse' : 'or tap to browse';
    return AnimatedContainer(
      duration: const Duration(milliseconds: 160),
      curve: Curves.easeOut,
      width: double.infinity,
      padding: EdgeInsets.symmetric(vertical: dragging ? 52 : 44, horizontal: 20),
      decoration: BoxDecoration(
        gradient: dragging ? null : AppGradients.heroWash,
        color: dragging ? AppColors.primaryTint : null,
        borderRadius: BorderRadius.circular(AppRadii.lg),
        border: Border.all(
          color: active ? AppColors.primary : AppColors.primary.withValues(alpha: 0.22),
          width: dragging ? 2 : 1.4,
        ),
        boxShadow: active ? AppShadows.soft : null,
      ),
      child: Column(
        children: [
          AnimatedScale(
            scale: dragging ? 1.12 : 1.0,
            duration: const Duration(milliseconds: 160),
            child: Container(
              width: 60,
              height: 60,
              decoration: BoxDecoration(
                gradient: AppGradients.brand,
                borderRadius: BorderRadius.circular(18),
                boxShadow: const [
                  BoxShadow(
                      color: Color(0x442563EB),
                      blurRadius: 18,
                      offset: Offset(0, 8),
                      spreadRadius: -4),
                ],
              ),
              child: Icon(dragging ? Icons.file_download_rounded : Icons.cloud_upload_rounded,
                  size: 30, color: Colors.white),
            ),
          ),
          const SizedBox(height: 14),
          Text(
            dragging
                ? 'Drop your files to add them'
                : (hasFiles
                    ? 'Drag & drop more files'
                    : 'Drag & drop your files here'),
            style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 4),
          Text('$browseHint · PDF, JPG, PNG, or HEIC',
              style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
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
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadii.md),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: (isPdf ? AppColors.error : AppColors.primary)
                  .withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              isPdf ? Icons.picture_as_pdf_rounded : Icons.image_rounded,
              color: isPdf ? AppColors.error : AppColors.primary,
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
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                Text('${(file.bytes.length / 1024).toStringAsFixed(0)} KB',
                    style: const TextStyle(
                        fontSize: 12, color: AppColors.textMuted)),
              ],
            ),
          ),
          const Icon(Icons.check_circle_rounded,
              size: 18, color: AppColors.accent),
          if (onRemove != null)
            IconButton(
              icon: const Icon(Icons.close_rounded, size: 18),
              color: AppColors.textMuted,
              onPressed: onRemove,
              tooltip: 'Remove',
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
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surfaceAlt,
        borderRadius: BorderRadius.circular(AppRadii.md),
        border: Border.all(color: AppColors.border),
      ),
      child: CheckboxListTile(
        value: value,
        onChanged: onChanged,
        controlAffinity: ListTileControlAffinity.leading,
        contentPadding: const EdgeInsets.symmetric(horizontal: 12),
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadii.md)),
        title: const Text(AppCopy.consentText,
            style: TextStyle(fontSize: 13, height: 1.4)),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Wrap(
            spacing: 4,
            children: [
              const Text('Details:',
                  style: TextStyle(
                      fontSize: 12, color: AppColors.textSecondary)),
              _legalLink('Privacy Policy', 'https://getmyyes.com/privacy.html'),
              const Text('·',
                  style: TextStyle(
                      fontSize: 12, color: AppColors.textSecondary)),
              _legalLink('Terms of Service', 'https://getmyyes.com/terms.html'),
            ],
          ),
        ),
      ),
    );
  }

  static Widget _legalLink(String label, String url) {
    return GestureDetector(
      onTap: () => launchUrl(Uri.parse(url)),
      child: Text(
        label,
        style: const TextStyle(
          fontSize: 12,
          color: AppColors.primaryDark,
          decoration: TextDecoration.underline,
        ),
      ),
    );
  }
}
