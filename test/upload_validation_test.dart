import 'package:claimhelper/features/upload/upload_validation.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const mb = 1024 * 1024;

  UploadFileDescriptor file(String name, int megabytes) =>
      UploadFileDescriptor(name: name, sizeBytes: megabytes * mb);

  test('accepts supported files at the per-file and total limits', () {
    final plan = planUploadSelection(
      existing: [file('first.pdf', 20)],
      incoming: [file('second.jpg', 20), file('third.png', 5)],
    );

    expect(plan.acceptedIndexes, [0, 1]);
    expect(plan.rejections, isEmpty);
    expect(plan.totalBytes, maxUploadTotalBytes);
  });

  test('rejects a file over 20 MB with a clear reason', () {
    final plan = planUploadSelection(
      existing: const [],
      incoming: [file('large.pdf', 21)],
    );

    expect(plan.acceptedIndexes, isEmpty);
    expect(plan.rejections.single.reason, UploadRejectionReason.fileTooLarge);
    expect(plan.rejections.single.message, contains('20 MB or smaller'));
  });

  test('keeps accepted files while rejecting the file over 45 MB total', () {
    final plan = planUploadSelection(
      existing: [file('existing.pdf', 20)],
      incoming: [file('page-one.jpg', 20), file('page-two.jpg', 10)],
    );

    expect(plan.acceptedIndexes, [0]);
    expect(plan.rejections.single.reason, UploadRejectionReason.totalTooLarge);
    expect(plan.totalBytes, 40 * mb);
  });

  test('rejects duplicate and unsupported selections', () {
    final plan = planUploadSelection(
      existing: [file('denial.pdf', 1)],
      incoming: [
        file('DENIAL.PDF', 1),
        file('notes.txt', 1),
      ],
    );

    expect(plan.acceptedIndexes, isEmpty);
    expect(
      plan.rejections.map((issue) => issue.reason),
      [UploadRejectionReason.duplicate, UploadRejectionReason.unsupported],
    );
  });

  test('formats selected-file sizes for readable feedback', () {
    expect(formatUploadBytes(512), '512 B');
    expect(formatUploadBytes(1536), '2 KB');
    expect(formatUploadBytes(5 * mb), '5 MB');
    expect(formatUploadBytes((2.5 * mb).round()), '2.5 MB');
  });
}
