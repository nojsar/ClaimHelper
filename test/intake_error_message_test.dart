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

  test('does not expose unexpected backend error details', () {
    expect(
      friendlyIntakeError(Exception('database host and stack trace')),
      'Something went wrong. Please check your connection and retry.',
    );
  });
}
