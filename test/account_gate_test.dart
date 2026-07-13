import 'package:claimhelper/services/mock_backend.dart';
import 'package:claimhelper/state/providers.dart';
import 'package:claimhelper/widgets/account_gate.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class _TrackingBackend extends MockBackend {
  String? claimedCaseId;

  @override
  Future<void> signInWithEmailAndClaimCase(
      String email, String password, String caseId) async {
    claimedCaseId = caseId;
    await super.signInWithEmailAndClaimCase(email, password, caseId);
  }
}

class _GateHarness extends ConsumerWidget {
  const _GateHarness();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      body: Center(
        child: FilledButton(
          onPressed: () => ensureAccount(
            context,
            ref,
            caseId: 'guest-case-123',
            title: 'Create an account',
            reason: 'Keep this case available.',
          ),
          child: const Text('Continue'),
        ),
      ),
    );
  }
}

void main() {
  testWidgets('existing-account sign-in carries the current guest case id',
      (tester) async {
    final backend = _TrackingBackend();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [backendProvider.overrideWithValue(backend)],
        child: const MaterialApp(home: _GateHarness()),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Already have an account? Sign in'));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).at(0), 'person@example.com');
    await tester.enterText(find.byType(TextField).at(1), 'correct-password');
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pumpAndSettle();

    expect(backend.claimedCaseId, 'guest-case-123');
    expect(find.byType(BottomSheet), findsNothing);
  });
}
