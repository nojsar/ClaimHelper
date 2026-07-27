import 'dart:typed_data';

import 'package:claimhelper/core/theme.dart';
import 'package:claimhelper/features/preview/preview_paywall_screen.dart';
import 'package:claimhelper/models/appeal_case.dart';
import 'package:claimhelper/models/extraction.dart';
import 'package:claimhelper/models/packet.dart';
import 'package:claimhelper/services/mock_backend.dart';
import 'package:claimhelper/state/providers.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class _QueuedFilePicker extends FilePicker {
  _QueuedFilePicker(this.results);

  final List<FilePickerResult?> results;
  List<String>? lastAllowedExtensions;

  @override
  Future<FilePickerResult?> pickFiles({
    String? dialogTitle,
    String? initialDirectory,
    FileType type = FileType.any,
    List<String>? allowedExtensions,
    Function(FilePickerStatus)? onFileLoading,
    bool allowCompression = false,
    int compressionQuality = 0,
    bool allowMultiple = false,
    bool withData = false,
    bool withReadStream = false,
    bool lockParentWindow = false,
    bool readSequential = false,
  }) async {
    lastAllowedExtensions = allowedExtensions;
    return results.removeAt(0);
  }
}

class _CancelledFilePicker extends FilePicker {
  @override
  Future<FilePickerResult?> pickFiles({
    String? dialogTitle,
    String? initialDirectory,
    FileType type = FileType.any,
    List<String>? allowedExtensions,
    Function(FilePickerStatus)? onFileLoading,
    bool allowCompression = false,
    int compressionQuality = 0,
    bool allowMultiple = false,
    bool withData = false,
    bool withReadStream = false,
    bool lockParentWindow = false,
    bool readSequential = false,
  }) async =>
      null;
}

class _PreviewBackend extends MockBackend {
  @override
  bool get isAnonymous => false;

  @override
  String? get currentEmail => 'person@example.com';

  @override
  Future<AppealCase?> getCase(String caseId) async => _previewCase;
}

void main() {
  testWidgets(
      'preview additions reject duplicate files with persistent accessible feedback at 200%',
      (tester) async {
    final file = PlatformFile(
      name: 'clinician-note.pdf',
      size: 4,
      bytes: Uint8List.fromList([1, 2, 3, 4]),
    );
    final picker = _QueuedFilePicker([
      FilePickerResult([file]),
      FilePickerResult([file]),
    ]);
    FilePicker.platform = picker;
    addTearDown(() => FilePicker.platform = _CancelledFilePicker());

    tester.view.physicalSize = const Size(320, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final semantics = tester.ensureSemantics();

    await tester.pumpWidget(
      ProviderScope(
        overrides: [backendProvider.overrideWithValue(_PreviewBackend())],
        child: MaterialApp(
          theme: buildAppTheme(),
          home: const MediaQuery(
            data: MediaQueryData(
              textScaler: TextScaler.linear(2),
              disableAnimations: true,
            ),
            child: PreviewPaywallScreen(caseId: 'case-preview'),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final attach = find.widgetWithText(OutlinedButton, 'Attach documents');
    await tester.ensureVisible(attach);
    await tester.pumpAndSettle();
    await tester.tap(attach);
    await tester.pumpAndSettle();
    expect(find.text('clinician-note.pdf'), findsOneWidget);

    await tester.tap(attach);
    await tester.pumpAndSettle();

    const error = 'clinician-note.pdf is already selected.';
    expect(find.text(error), findsOneWidget);
    expect(find.text('clinician-note.pdf'), findsOneWidget);
    expect(
      picker.lastAllowedExtensions,
      containsAll(<String>['pdf', 'jpg', 'jpeg', 'png', 'heic', 'heif', 'webp']),
    );
    final liveRegions = tester
        .widgetList<Semantics>(find.byType(Semantics))
        .where((widget) =>
            widget.properties.liveRegion == true &&
            widget.properties.label == 'File error: $error');
    expect(liveRegions, isNotEmpty);
    expect(
      find.textContaining('20 MB each, 45 MB total'),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
    semantics.dispose();
  });
}

const _extraction = DenialExtraction(
  documentType: DocumentType.denialLetter,
  denialCategory: DenialCategory.notMedicallyNecessary,
  insurerName: 'Sample Health Plan',
  deniedItem: 'Physical therapy',
  denialReasonText: 'The service was not medically necessary.',
);

final _previewCase = AppealCase(
  id: 'case-preview',
  status: CaseStatus.preview,
  extraction: _extraction,
  preview: const FreePreview(
    denialSummary: 'The insurer denied physical therapy.',
    likelyAppealPath: 'Submit an internal appeal.',
    missingInfo: ['A clinician statement'],
    recommendedPacketType: 'Medical-necessity appeal packet',
  ),
);
