/// Upload limits shared by every file-selection entry point on the intake
/// screen. Keeping the decision pure makes it possible to reject a selection
/// before any bytes are sent to the backend.
const int maxUploadFileBytes = 20 * 1024 * 1024;
const int maxUploadTotalBytes = 45 * 1024 * 1024;

const List<String> allowedUploadExtensions = [
  'pdf',
  'jpg',
  'jpeg',
  'png',
  'heic',
  'heif',
  'webp',
];

class UploadFileDescriptor {
  const UploadFileDescriptor({required this.name, required this.sizeBytes});

  final String name;
  final int sizeBytes;
}

enum UploadRejectionReason {
  unsupported,
  duplicate,
  fileTooLarge,
  totalTooLarge,
}

class UploadRejection {
  const UploadRejection({
    required this.file,
    required this.reason,
  });

  final UploadFileDescriptor file;
  final UploadRejectionReason reason;

  String get message => switch (reason) {
        UploadRejectionReason.unsupported =>
          '${file.name} is not supported. Use PDF, JPG, PNG, HEIC, or WebP.',
        UploadRejectionReason.duplicate => '${file.name} is already selected.',
        UploadRejectionReason.fileTooLarge =>
          '${file.name} is ${formatUploadBytes(file.sizeBytes)}. '
              'Each file must be 20 MB or smaller.',
        UploadRejectionReason.totalTooLarge =>
          '${file.name} would put this upload over 45 MB total.',
      };
}

class UploadSelectionPlan {
  const UploadSelectionPlan({
    required this.acceptedIndexes,
    required this.rejections,
    required this.totalBytes,
  });

  /// Indexes into the incoming descriptor list that may be added.
  final List<int> acceptedIndexes;
  final List<UploadRejection> rejections;
  final int totalBytes;
}

bool isAllowedUploadName(String name) {
  final dot = name.lastIndexOf('.');
  if (dot < 0 || dot == name.length - 1) return false;
  return allowedUploadExtensions
      .contains(name.substring(dot + 1).toLowerCase());
}

UploadSelectionPlan planUploadSelection({
  required List<UploadFileDescriptor> existing,
  required List<UploadFileDescriptor> incoming,
}) {
  var runningTotal = existing.fold<int>(0, (sum, file) => sum + file.sizeBytes);
  final seen = <String>{
    for (final file in existing) _dedupeKey(file),
  };
  final accepted = <int>[];
  final rejected = <UploadRejection>[];

  for (var index = 0; index < incoming.length; index += 1) {
    final file = incoming[index];
    UploadRejectionReason? reason;
    if (!isAllowedUploadName(file.name)) {
      reason = UploadRejectionReason.unsupported;
    } else if (seen.contains(_dedupeKey(file))) {
      reason = UploadRejectionReason.duplicate;
    } else if (file.sizeBytes > maxUploadFileBytes) {
      reason = UploadRejectionReason.fileTooLarge;
    } else if (runningTotal + file.sizeBytes > maxUploadTotalBytes) {
      reason = UploadRejectionReason.totalTooLarge;
    }

    if (reason != null) {
      rejected.add(UploadRejection(file: file, reason: reason));
      continue;
    }

    accepted.add(index);
    seen.add(_dedupeKey(file));
    runningTotal += file.sizeBytes;
  }

  return UploadSelectionPlan(
    acceptedIndexes: List.unmodifiable(accepted),
    rejections: List.unmodifiable(rejected),
    totalBytes: runningTotal,
  );
}

String formatUploadBytes(int bytes) {
  const kilobyte = 1024;
  const megabyte = 1024 * 1024;
  if (bytes < kilobyte) return '$bytes B';
  if (bytes < megabyte) return '${(bytes / kilobyte).toStringAsFixed(0)} KB';
  final value = (bytes / megabyte).toStringAsFixed(1);
  return '${value.endsWith('.0') ? value.substring(0, value.length - 2) : value} MB';
}

String _dedupeKey(UploadFileDescriptor file) =>
    '${file.name.toLowerCase()}\u0000${file.sizeBytes}';
