import 'package:claimhelper/widgets/case_loader.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('CaseLoader', () {
    testWidgets('paints through a full animation loop without errors',
        (tester) async {
      await tester.pumpWidget(const MaterialApp(
        home: Scaffold(body: Center(child: CaseLoader())),
      ));
      // Step through the 3s loop, including the stamp slam and message swap.
      for (var i = 0; i < 14; i++) {
        await tester.pump(const Duration(milliseconds: 250));
      }
      expect(tester.takeException(), isNull);
      expect(find.byType(CaseLoader), findsOneWidget);
    });

    testWidgets('renders determinate progress rule', (tester) async {
      await tester.pumpWidget(const MaterialApp(
        home: Scaffold(
            body: Center(
                child: CaseLoader(progress: 0.4, messages: ['Uploading…']))),
      ));
      await tester.pump(const Duration(milliseconds: 400));
      expect(tester.takeException(), isNull);
      expect(find.text('Uploading…'), findsOneWidget);
    });
  });
}
