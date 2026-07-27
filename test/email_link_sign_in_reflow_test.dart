import 'package:claimhelper/core/theme.dart';
import 'package:claimhelper/features/account/email_link_sign_in_screen.dart';
import 'package:claimhelper/services/mock_backend.dart';
import 'package:claimhelper/state/providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets(
      'secure case-return form remains reachable at 200% text zoom on mobile',
      (tester) async {
    tester.view.physicalSize = const Size(320, 568);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final semantics = tester.ensureSemantics();

    await tester.pumpWidget(
      ProviderScope(
        overrides: [backendProvider.overrideWithValue(MockBackend())],
        child: MaterialApp(
          theme: buildAppTheme(),
          home: const MediaQuery(
            data: MediaQueryData(
              textScaler: TextScaler.linear(2),
              disableAnimations: true,
            ),
            child: EmailLinkSignInScreen(caseId: 'returning-case'),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(
      tester
          .getSemantics(find.text('Confirm secure sign-in').last)
          .getSemanticsData()
          .flagsCollection
          .isHeader,
      isTrue,
    );

    final continueAction = find.text('Continue securely');
    await tester.scrollUntilVisible(
      continueAction,
      200,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.tap(continueAction);
    await tester.pumpAndSettle();

    expect(
      find.text('Enter the email address that received the link.'),
      findsOneWidget,
    );
    expect(
      tester.widgetList<Semantics>(find.byType(Semantics)).any(
            (widget) =>
                widget.properties.liveRegion == true &&
                (widget.properties.label ?? '').startsWith('Error:'),
          ),
      isTrue,
    );
    expect(tester.takeException(), isNull);
    semantics.dispose();
  });
}
