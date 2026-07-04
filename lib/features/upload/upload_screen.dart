import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/constants.dart';
import '../../core/theme.dart';
import '../../services/backend.dart';
import '../../state/intake_controller.dart';
import '../../widgets/app_scaffold.dart';

class UploadScreen extends ConsumerStatefulWidget {
  const UploadScreen({super.key});

  @override
  ConsumerState<UploadScreen> createState() => _UploadScreenState();
}

class _UploadScreenState extends ConsumerState<UploadScreen> {
  final List<PickedUpload> _files = [];
  bool _consent = false;
  bool _busy = false;

  static const _allowedExt = ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'heif', 'webp'];

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

  Future<void> _pickFiles() async {
    final result = await FilePicker.platform.pickFiles(
      allowMultiple: true,
      type: FileType.custom,
      allowedExtensions: _allowedExt,
      withData: true,
    );
    if (result == null) return;
    setState(() {
      for (final f in result.files) {
        if (f.bytes != null) {
          _files.add(PickedUpload(
              name: f.name, bytes: f.bytes!, mimeType: _mimeFor(f.name)));
        }
      }
    });
  }

  Future<void> _takePhoto() async {
    final picker = ImagePicker();
    final shot = await picker.pickImage(source: ImageSource.camera);
    if (shot == null) return;
    final bytes = await shot.readAsBytes();
    setState(() {
      _files.add(PickedUpload(
          name: shot.name, bytes: bytes, mimeType: _mimeFor(shot.name)));
    });
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
    // Camera capture only makes sense on mobile.
    final showCamera = !kIsWeb;

    return AppScaffold(
      title: 'Upload your denial',
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Add your documents',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            const Text(
              'Upload the denial letter, EOB, or prior-authorization denial. '
              'PDF, JPG, PNG, or HEIC. You can add more than one.',
              style: TextStyle(color: AppColors.textSecondary),
            ),
            const SizedBox(height: 20),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                OutlinedButton.icon(
                  onPressed: _busy ? null : _pickFiles,
                  icon: const Icon(Icons.attach_file),
                  label: Text(kIsWeb ? 'Choose files' : 'Choose from files'),
                ),
                if (showCamera)
                  OutlinedButton.icon(
                    onPressed: _busy ? null : _takePhoto,
                    icon: const Icon(Icons.photo_camera_outlined),
                    label: const Text('Take a photo'),
                  ),
              ],
            ),
            const SizedBox(height: 16),
            if (_files.isEmpty)
              _EmptyDropHint()
            else
              ..._files.asMap().entries.map((e) => Card(
                    child: ListTile(
                      leading: Icon(
                        e.value.mimeType == 'application/pdf'
                            ? Icons.picture_as_pdf_outlined
                            : Icons.image_outlined,
                        color: AppColors.primary,
                      ),
                      title: Text(e.value.name),
                      subtitle: Text(
                          '${(e.value.bytes.length / 1024).toStringAsFixed(0)} KB'),
                      trailing: IconButton(
                        icon: const Icon(Icons.close),
                        onPressed: _busy
                            ? null
                            : () => setState(() => _files.removeAt(e.key)),
                      ),
                    ),
                  )),
            const SizedBox(height: 12),
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
                icon: const Icon(Icons.auto_awesome),
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

class _EmptyDropHint extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 44, horizontal: 20),
      decoration: BoxDecoration(
        gradient: AppGradients.heroWash,
        borderRadius: BorderRadius.circular(AppRadii.lg),
        border: Border.all(color: AppColors.primary.withValues(alpha: 0.18)),
      ),
      child: Column(
        children: [
          Container(
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
            child: const Icon(Icons.cloud_upload_rounded,
                size: 30, color: Colors.white),
          ),
          const SizedBox(height: 14),
          const Text('Add your documents to begin',
              style: TextStyle(
                  fontSize: 15.5, fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          const Text('PDF, JPG, PNG, or HEIC · up to a few files',
              style: TextStyle(fontSize: 13, color: AppColors.textSecondary)),
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
        color: const Color(0xFFF1F5F9),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.border),
      ),
      child: CheckboxListTile(
        value: value,
        onChanged: onChanged,
        controlAffinity: ListTileControlAffinity.leading,
        contentPadding: const EdgeInsets.symmetric(horizontal: 12),
        title: const Text(AppCopy.consentText,
            style: TextStyle(fontSize: 13, height: 1.35)),
      ),
    );
  }
}
