import 'package:claimhelper/features/account/account_screen.dart';
import 'package:claimhelper/services/mock_backend.dart';
import 'package:claimhelper/state/providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class _RecoveryBackend extends MockBackend {
  String? resetEmail;
  bool failReset = false;

  @override
  Future<void> sendPasswordResetEmail(String email) async {
    resetEmail = email;
    if (failReset) throw Exception('offline');
  }
}

Widget _app(_RecoveryBackend backend) => ProviderScope(
      overrides: [backendProvider.overrideWithValue(backend)],
      child: const MaterialApp(home: AccountScreen()),
    );

void main() {
  testWidgets('sign-in mode sends a non-enumerating password reset message',
      (tester) async {
    final backend = _RecoveryBackend();
    await tester.pumpWidget(_app(backend));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Already have one?'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextField, 'Email'),
      ' buyer@example.com ',
    );
    await tester.tap(find.text('Forgot password?'));
    await tester.pumpAndSettle();

    expect(backend.resetEmail, 'buyer@example.com');
    expect(
      find.textContaining('If an account uses that email'),
      findsOneWidget,
    );
    final resetStatus = tester
        .widgetList<Semantics>(find.byType(Semantics))
        .where((widget) =>
            widget.properties.label?.contains('If an account uses that email') ==
            true)
        .toList();
    expect(resetStatus, hasLength(1));
    expect(resetStatus.single.properties.liveRegion, isTrue);
  });

  testWidgets('password reset validates email before contacting the backend',
      (tester) async {
    final backend = _RecoveryBackend();
    await tester.pumpWidget(_app(backend));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Already have one?'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Forgot password?'));
    await tester.pumpAndSettle();

    expect(backend.resetEmail, isNull);
    expect(find.text('Enter your account email first.'), findsOneWidget);
  });

  testWidgets('password reset exposes a retryable network error',
      (tester) async {
    final backend = _RecoveryBackend()..failReset = true;
    await tester.pumpWidget(_app(backend));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Already have one?'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextField, 'Email'),
      'buyer@example.com',
    );
    await tester.tap(find.text('Forgot password?'));
    await tester.pumpAndSettle();

    expect(find.textContaining('could not send the reset email'), findsOneWidget);
  });
}
