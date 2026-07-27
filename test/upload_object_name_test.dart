import 'package:claimhelper/services/upload_object_name.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('same source name never collides across upload batches', () {
    final first = uploadObjectName(
      'scan.pdf',
      batchId: 'batch-a',
      index: 0,
    );
    final later = uploadObjectName(
      'scan.pdf',
      batchId: 'batch-b',
      index: 0,
    );

    expect(first, isNot(later));
    expect(first, 'batch-a_1.pdf');
    expect(later, 'batch-b_1.pdf');
  });

  test('files within one batch receive distinct ordered names', () {
    final first = uploadObjectName(
      'page.jpg',
      batchId: 'batch',
      index: 0,
    );
    final second = uploadObjectName(
      'page.jpg',
      batchId: 'batch',
      index: 1,
    );

    expect(first, 'batch_1.jpg');
    expect(second, 'batch_2.jpg');
  });

  test('original patient filename is not retained in the object path', () {
    final value = uploadObjectName(
      '${List.filled(220, 'a').join()} patient name?.PDF',
      batchId: 'batch',
      index: 0,
    );

    expect(value, 'batch_1.pdf');
    expect(value, isNot(contains('patient')));
  });

  test('unknown extensions are omitted', () {
    expect(
      uploadObjectName('notes.txt', batchId: 'batch', index: 0),
      'batch_1',
    );
  });
}
