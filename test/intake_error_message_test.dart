import 'package:claimhelper/state/intake_controller.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('shows the bounded document-reading retry time without SDK noise', () {
    final message = friendlyIntakeError(
      Exception(
        '[firebase_functions/resource-exhausted] '
        'Document-reading limit reached (5 per hour). '
        'Try again in about 37 min.',
      ),
    );

    expect(
      message,
      'Document-reading limit reached (5 per hour). '
      'Try again in about 37 min.',
    );
    expect(message, isNot(contains('firebase_functions')));
  });

  test('says plainly when no denial can be read from the upload', () {
    final message = friendlyIntakeError(
      Exception(
        "[firebase_functions/invalid-argument] We couldn't find a "
        'health-insurance denial in that file. Try a clearer photo that '
        'shows every page, or the original PDF.',
      ),
    );

    expect(
      message,
      "We couldn't find a health-insurance denial in that file. Try a "
      'clearer photo that shows every page, or the original PDF.',
    );
    expect(message, isNot(contains('connection')));
  });

  test('names an unsupported file type and the size limit', () {
    expect(
      friendlyIntakeError(Exception(
        '[firebase_functions/invalid-argument] Unsupported file type '
        'application/zip. Upload a PDF, JPG, PNG, or HEIC file.',
      )),
      'Unsupported file type application/zip. Upload a PDF, JPG, PNG, or '
      'HEIC file.',
    );
    expect(
      friendlyIntakeError(Exception(
        '[firebase_functions/invalid-argument] Uploaded files exceed the '
        '45 MB combined limit. Remove a file and try again.',
      )),
      'Uploaded files exceed the 45 MB combined limit. Remove a file and '
      'try again.',
    );
  });

  test('does not expose unexpected backend error details', () {
    expect(
      friendlyIntakeError(Exception('database host and stack trace')),
      'Something went wrong. Please check your connection and retry.',
    );
  });
}
