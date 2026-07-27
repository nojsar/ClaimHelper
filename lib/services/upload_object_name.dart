import 'dart:math';

/// Creates one opaque batch identifier locally; no user or case data is used.
String newUploadBatchId([Random? random]) {
  final source = random ?? Random.secure();
  return List.generate(
    3,
    (_) => source.nextInt(0x7fffffff).toRadixString(36),
  ).join();
}

/// Produces a unique Storage object name that retains only the safe extension.
/// Original filenames can contain patient names, so they never enter Storage
/// paths, function logs, or model-visible attachment names.
String uploadObjectName(
  String originalName, {
  required String batchId,
  required int index,
}) {
  final dot = originalName.lastIndexOf('.');
  final candidate = dot > 0 ? originalName.substring(dot).toLowerCase() : '';
  const allowedExtensions = {
    '.pdf',
    '.jpg',
    '.jpeg',
    '.png',
    '.heic',
    '.heif',
    '.webp',
  };
  final extension = allowedExtensions.contains(candidate) ? candidate : '';
  return '${batchId}_${index + 1}$extension';
}
