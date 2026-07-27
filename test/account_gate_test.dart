import 'package:claimhelper/features/account/email_link_sign_in_screen.dart';
import 'package:claimhelper/app_router.dart';
import 'package:claimhelper/services/mock_backend.dart';
import 'package:claimhelper/state/providers.dart';
import 'package:claimhelper/widgets/account_gate.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

class _TrackingBackend extends MockBackend {
  String? claimedCaseId;
  String? emailedCaseId;
  String? emailedAddress;
  String? emailedContinueUrl;
  String? emailLinkClaimedCaseId;
  final List<String> funnelEvents = [];

  @override
  Future<void> signInWithEmailAndClaimCase(
      String email, String password, String caseId) async {
    claimedCaseId = caseId;
    await super.signInWithEmailAndClaimCase(email, password, caseId);
  }

  @override
  Future<void> sendEmailLinkAndPrepareCaseClaim({
    required String email,
    required String caseId,
    required String continueUrl,
  }) async {
    emailedAddress = email;
    emailedCaseId = caseId;
    emailedContinueUrl = continueUrl;
  }

  @override
  Future<void> signInWithEmailLinkAndClaimCase({
    required String email,
    required String emailLink,
    required String caseId,
  }) async {
    emailLinkClaimedCaseId = caseId;
    await super.signInWithEmailLinkAndClaimCase(
      email: email,
      emailLink: emailLink,
      caseId: caseId,
    );
  }

  @override
  Future<void> recordCaseFunnelEvent(String caseId, String event) async {
    funnelEvents.add('$caseId:$event');
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
  test('email action continueUrl restores the email-link route and state', () {
    final actionUrl = Uri.parse(
      'https://getmyyes.com/?mode=signIn&oobCode=one-time-code&'
      'continueUrl=https%3A%2F%2Fgetmyyes.com%2F%23%2Femail-link%3F'
      'caseId%3Dguest-case-123%26resumeCheckout%3Dpacket_plus',
    );

    expect(
      initialRouterLocationFor(actionUrl),
      '/email-link?caseId=guest-case-123&resumeCheckout=packet_plus',
    );
  });

  test('email action continueUrl cannot choose an unrelated app route', () {
    final actionUrl = Uri.parse(
      'https://getmyyes.com/?mode=signIn&oobCode=one-time-code&'
      'continueUrl=https%3A%2F%2Fgetmyyes.com%2F%23%2Fstats',
    );

    expect(initialRouterLocationFor(actionUrl), '/');
  });

  testWidgets('default account gate sends a secure email link for the case',
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
    await tester.enterText(find.byType(TextField), 'person@example.com');
    await tester.tap(find.text('Send secure sign-in link'));
    await tester.pumpAndSettle();

    expect(backend.emailedAddress, 'person@example.com');
    expect(backend.emailedCaseId, 'guest-case-123');
    expect(backend.emailedContinueUrl, contains('#/email-link?'));
    expect(find.textContaining('Check person@example.com'), findsOneWidget);
  });

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
    await tester.tap(find.text('Prefer a password? Use email and password'));
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

  testWidgets('email-link completion claims the case and resumes checkout',
      (tester) async {
    final backend = _TrackingBackend();
    final router = GoRouter(
      initialLocation: '/email-link',
      routes: [
        GoRoute(
          path: '/email-link',
          builder: (_, __) => const EmailLinkSignInScreen(
            caseId: 'guest-case-123',
            resumeCheckoutKind: 'packet',
          ),
        ),
        GoRoute(
          path: '/case/:caseId/preview',
          builder: (_, state) => Scaffold(
            body: Text('Preview ${state.pathParameters['caseId']}'),
          ),
        ),
      ],
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [backendProvider.overrideWithValue(backend)],
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'person@example.com');
    await tester.tap(find.text('Continue securely'));
    await tester.pumpAndSettle();

    expect(backend.emailLinkClaimedCaseId, 'guest-case-123');
    expect(backend.funnelEvents, contains('guest-case-123:account_completed'));
    expect(find.text('Preview guest-case-123'), findsOneWidget);
  });
}
