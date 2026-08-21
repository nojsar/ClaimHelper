import 'package:claimhelper/core/theme.dart';
import 'package:claimhelper/features/home/landing_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('Landing screen renders the headline and CTA', (tester) async {
    tester.view.physicalSize = const Size(1200, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: buildAppTheme(),
          home: const LandingScreen(),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('See my free denial summary'), findsWidgets);
    expect(find.textContaining('appeal packet'), findsWidgets);
  });
}
