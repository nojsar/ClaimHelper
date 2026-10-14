import 'dart:async';

import 'package:claimhelper/core/theme.dart';
import 'package:claimhelper/features/preview/purchase_success_screen.dart';
import 'package:claimhelper/models/appeal_case.dart';
import 'package:claimhelper/models/packet.dart';
import 'package:claimhelper/services/mock_backend.dart';
import 'package:claimhelper/state/providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class _FailedGenerationBackend extends MockBackend {
  final generation = Completer<AppealPacket>();
  var generationAttempts = 0;

  @override
  Stream<AppealCase?> watchCase(String caseId) => Stream.value(
        AppealCase(
          id: caseId,
          status: CaseStatus.error,
          paid: true,
          lastError: 'Packet generation failed.',
        ),
      );

  @override
  Future<AppealPacket> generateAppealPacket(String caseId) {
    generationAttempts += 1;
    return generation.future;
  }
}

class _ReturnConfirmationBackend extends MockBackend {
  var confirmationAttempts = 0;

  @override
  Stream<AppealCase?> watchCase(String caseId) => Stream.value(
        AppealCase(
          id: caseId,
          status: CaseStatus.preview,
        ),
      );

  @override
  Future<void> confirmCheckoutSession(String caseId, String sessionId) async {
    expect(caseId, 'return-case');
    expect(sessionId, 'cs_live_12345678Return');
    confirmationAttempts += 1;
  }
}

class _WritingPacketBackend extends MockBackend {
  @override
  Stream<AppealCase?> watchCase(String caseId) => Stream.value(
        AppealCase(
          id: caseId,
          status: CaseStatus.paid,
          paid: true,
          runningOperation: 'packet',
          runningSince: DateTime.now().subtract(const Duration(seconds: 60)),
          runningUntil: DateTime.now().add(const Duration(minutes: 5)),
        ),
      );

  // The payment-triggered worker owns generation; the page only observes.
  @override
  Future<AppealPacket> generateAppealPacket(String caseId) =>
      Completer<AppealPacket>().future;
}

void main() {
  testWidgets(
      'packet writing shows the usual time, time left and that leaving is safe',
      (tester) async {
    tester.view.physicalSize = const Size(320, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          backendProvider.overrideWithValue(_WritingPacketBackend()),
        ],
        child: MaterialApp(
          theme: buildAppTheme(),
          home: const MediaQuery(
            data: MediaQueryData(textScaler: TextScaler.linear(2)),
            child: PurchaseSuccessScreen(caseId: 'writing-case'),
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));

    expect(find.text('Usually 2–4 minutes'), findsOneWidget);
    expect(find.text('About 2 min left'), findsOneWidget);
    expect(find.textContaining('You can close this page.'), findsOneWidget);
    final bar = tester.widget<LinearProgressIndicator>(
        find.byType(LinearProgressIndicator));
    expect(bar.value, closeTo(0.8 * 61 / 180, 0.02));
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'Stripe return confirms its exact session immediately and on refresh',
      (tester) async {
    final backend = _ReturnConfirmationBackend();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [backendProvider.overrideWithValue(backend)],
        child: MaterialApp(
          theme: buildAppTheme(),
          home: const MediaQuery(
            data: MediaQueryData(disableAnimations: true),
            child: PurchaseSuccessScreen(
              caseId: 'return-case',
              sessionId: 'cs_live_12345678Return',
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(backend.confirmationAttempts, 1);
    expect(find.text('Refresh status'), findsOneWidget);

    await tester.tap(find.text('Refresh status'));
    await tester.pump();
    expect(backend.confirmationAttempts, 2);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'failed paid packet offers an accessible manual retry at 200% text zoom',
      (tester) async {
    tester.view.physicalSize = const Size(320, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final semantics = tester.ensureSemantics();

    final backend = _FailedGenerationBackend();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [backendProvider.overrideWithValue(backend)],
        child: MaterialApp(
          theme: buildAppTheme(),
          home: const MediaQuery(
            data: MediaQueryData(
              textScaler: TextScaler.linear(2),
              disableAnimations: true,
            ),
            child: PurchaseSuccessScreen(caseId: 'paid-failed-case'),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(backend.generationAttempts, 0);
    expect(
      find.text(
        'Your purchase is safe, but packet drafting stopped before it '
        'finished. Try again to resume it.',
      ),
      findsOneWidget,
    );
    expect(
      tester.widgetList<Semantics>(find.byType(Semantics)).any(
            (widget) =>
                widget.properties.liveRegion == true &&
                widget.properties.label == 'Error',
          ),
      isTrue,
    );
    expect(tester.takeException(), isNull);

    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();

    expect(backend.generationAttempts, 1);
    expect(find.text('Retrying packet generation…'), findsOneWidget);
    expect(
      tester.widgetList<Semantics>(find.byType(Semantics)).any(
            (widget) =>
                widget.properties.liveRegion == true &&
                (widget.properties.label ?? '').contains(
                  'Payment confirmed. Retrying packet generation',
                ),
          ),
      isTrue,
    );
    expect(tester.takeException(), isNull);
    semantics.dispose();
  });
}
