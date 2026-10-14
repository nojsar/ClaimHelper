import 'dart:convert';

import 'package:claimhelper/models/appeal_case.dart';
import 'package:claimhelper/services/resume_store.dart';
import 'package:claimhelper/widgets/case_loader.dart';
import 'package:claimhelper/widgets/estimated_progress.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('estimatedProgress', () {
    const expected = Duration(seconds: 40);

    test('moves steadily to 80% at the usual time', () {
      expect(estimatedProgress(Duration.zero, expected), 0.02);
      expect(estimatedProgress(const Duration(seconds: 20), expected),
          closeTo(0.4, 1e-9));
      expect(estimatedProgress(expected, expected), closeTo(0.8, 1e-9));
    });

    test('keeps creeping but never reaches 95% when it runs long', () {
      final late = estimatedProgress(const Duration(seconds: 60), expected);
      final later = estimatedProgress(const Duration(minutes: 10), expected);
      expect(late, greaterThan(0.8));
      expect(later, greaterThan(late));
      expect(later, lessThanOrEqualTo(0.95));
    });
  });

  group('remainingLabel', () {
    test('uses minutes, then rounded seconds, then a calm overrun line', () {
      const packet = Duration(minutes: 3);
      expect(remainingLabel(Duration.zero, packet), 'About 3 min left');
      expect(remainingLabel(const Duration(seconds: 140), packet),
          'About 40 seconds left');
      expect(remainingLabel(const Duration(seconds: 178), packet),
          'Almost done…');
      expect(remainingLabel(const Duration(minutes: 5), packet),
          'Taking a little longer than usual. Still working.');
    });
  });

  group('resumeEntryFor', () {
    final now = DateTime.fromMillisecondsSinceEpoch(1760000000000);

    test('stores the case and step, without query parameters', () {
      final entry = resumeEntryFor(
          '/case/AbC123xyz_-9/purchase-success?session_id=cs_live_1', now);
      expect(jsonDecode(entry!), {
        'id': 'AbC123xyz_-9',
        'step': 'purchase-success',
        'at': 1760000000000,
      });
    });

    test('ignores routes that are not resumable case steps', () {
      expect(resumeEntryFor('/upload', now), isNull);
      expect(resumeEntryFor('/account', now), isNull);
      expect(resumeEntryFor('/case/abc123/unknown', now), isNull);
      expect(resumeEntryFor('/case/<script>/preview', now), isNull);
    });
  });

  group('AppealCase.startedAtOf', () {
    test('reads the running step from the generation lease', () {
      final started = DateTime.now().subtract(const Duration(seconds: 30));
      final c = AppealCase.fromJson('c1', {
        'status': 'paid',
        'generationLease': {
          'operation': 'packet',
          'acquiredAt': started.toIso8601String(),
          'expiresAt': DateTime.now()
              .add(const Duration(minutes: 5))
              .toIso8601String(),
        },
      });
      expect(c.startedAtOf('packet'), started);
      expect(c.startedAtOf('preview'), isNull);
    });

    test('treats an expired lease as finished', () {
      final c = AppealCase.fromJson('c1', {
        'status': 'preview',
        'generationLease': {
          'operation': 'preview',
          'acquiredAt': DateTime.now()
              .subtract(const Duration(minutes: 8))
              .toIso8601String(),
          'expiresAt': DateTime.now()
              .subtract(const Duration(minutes: 2))
              .toIso8601String(),
        },
      });
      expect(c.startedAtOf('preview'), isNull);
    });
  });

  testWidgets('CaseLoader shows the usual time, time left and leave note',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Center(
          child: CaseLoader(
            title: 'Writing your free summary',
            expected: const Duration(seconds: 35),
            typical: 'Usually 20–40 seconds',
            startedAt: DateTime.now().subtract(const Duration(seconds: 10)),
            note: 'You can leave this page.',
            messages: const ['Preparing your plain-English summary…'],
          ),
        ),
      ),
    ));
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('Writing your free summary'), findsOneWidget);
    expect(find.text('Usually 20–40 seconds'), findsOneWidget);
    expect(find.textContaining('seconds left'), findsOneWidget);
    expect(find.text('You can leave this page.'), findsOneWidget);
    final bar = tester.widget<LinearProgressIndicator>(
        find.byType(LinearProgressIndicator));
    expect(bar.value, isNotNull);
    expect(bar.value!, greaterThan(0.2));
    expect(tester.takeException(), isNull);
  });
}
