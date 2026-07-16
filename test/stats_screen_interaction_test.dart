import 'dart:ui' show SemanticsAction, Tristate;

import 'package:claimhelper/features/admin/analytics_summary.dart';
import 'package:claimhelper/features/admin/stats_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('AnalyticsDashboardContent interactions', () {
    testWidgets(
        'Revenue card is an accessible selectable metric and changes the chart',
        (tester) async {
      final semantics = tester.ensureSemantics();
      await tester.pumpWidget(_dashboard());

      const revenueKey = ValueKey('analytics-metric:revenueCents');
      final revenue = find.byKey(revenueKey);
      await _scrollTo(tester, revenue);

      final before = _semanticsData(tester, revenue);
      expect(before.flagsCollection.isButton, isTrue);
      expect(before.flagsCollection.isSelected, Tristate.isFalse);
      expect(before.hasAction(SemanticsAction.tap), isTrue);

      await tester.tap(_tapTarget(revenue));
      await tester.pumpAndSettle();

      expect(find.text('Daily revenue'), findsOneWidget);
      final after = _semanticsData(tester, revenue);
      expect(after.flagsCollection.isButton, isTrue);
      expect(after.flagsCollection.isSelected, Tristate.isTrue);
      expect(after.hasAction(SemanticsAction.tap), isTrue);
      semantics.dispose();
    });

    testWidgets('a graph day scopes every value and tapping it again clears it',
        (tester) async {
      final selectedDays = <String?>[];
      final semantics = tester.ensureSemantics();
      await tester.pumpWidget(_dashboard(onDayChanged: selectedDays.add));

      const dayKey = ValueKey('analytics-day:2026-07-13');
      final day = find.byKey(dayKey);
      await _scrollTo(tester, day);

      await tester.tap(_tapTarget(day));
      await tester.pumpAndSettle();

      expect(selectedDays, const ['2026-07-13']);
      expect(find.text('Funnel (Jul 13)'), findsOneWidget);
      expect(
        find.descendant(
          of: find.byKey(const ValueKey('analytics-metric:visits')),
          matching: find.text('2'),
        ),
        findsOneWidget,
      );
      final daySemantics = _semanticsData(tester, day);
      expect(daySemantics.flagsCollection.isButton, isTrue);
      expect(daySemantics.flagsCollection.isSelected, Tristate.isTrue);
      expect(daySemantics.hasAction(SemanticsAction.tap), isTrue);

      await _scrollTo(tester, day);
      await tester.tap(_tapTarget(day));
      await tester.pumpAndSettle();

      expect(selectedDays, const ['2026-07-13', null]);
      semantics.dispose();
    });

    testWidgets(
        'funnel, product, and readiness values focus their daily series',
        (tester) async {
      final selectedMetrics = <AnalyticsMetric>[];
      final semantics = tester.ensureSemantics();
      await tester.pumpWidget(
        _dashboard(onMetricChanged: selectedMetrics.add),
      );

      const paidKey = ValueKey('analytics-funnel:funnel.paid');
      final paid = find.byKey(paidKey);
      await _scrollTo(tester, paid);
      await tester.tap(_tapTarget(paid));
      await tester.pumpAndSettle();
      expect(selectedMetrics.last, AnalyticsMetric.paid);
      expect(
        _semanticsData(tester, paid).flagsCollection.isSelected,
        Tristate.isTrue,
      );

      const extractionErrorsKey =
          ValueKey('analytics-product:product.extraction.errors');
      final extractionErrors = find.byKey(extractionErrorsKey);
      await _scrollTo(tester, extractionErrors);
      await tester.tap(_tapTarget(extractionErrors));
      await tester.pumpAndSettle();
      expect(selectedMetrics.last, AnalyticsMetric.extractionErrors);
      expect(
        _semanticsData(tester, extractionErrors).flagsCollection.isSelected,
        Tristate.isTrue,
      );

      const slowReadyKey =
          ValueKey('analytics-ready:performance.app_ready.over_8s');
      final slowReady = find.byKey(slowReadyKey);
      await _scrollTo(tester, slowReady);
      await tester.tap(_tapTarget(slowReady));
      await tester.pumpAndSettle();
      expect(selectedMetrics.last, AnalyticsMetric.readyOverEightSeconds);
      expect(
        _semanticsData(tester, slowReady).flagsCollection.isSelected,
        Tristate.isTrue,
      );
      semantics.dispose();
    });

    testWidgets(
        'a segment never fabricates a revenue comparison or segment zero',
        (tester) async {
      final semantics = tester.ensureSemantics();
      await tester.pumpWidget(
        _dashboard(
          selectedFilter: _franceFilter,
          filtered: _filteredSummary(),
        ),
      );

      await _scrollTo(tester, find.text('Daily visits'));
      const historicalDayKey = ValueKey('analytics-day:2026-06-14');
      final historicalDay = find.byKey(historicalDayKey);
      final historicalTooltip = tester.widget<Tooltip>(
        find.descendant(
          of: historicalDay,
          matching: find.byType(Tooltip),
        ),
      );
      expect(
        historicalTooltip.message,
        '2026-06-14: 1 overall, 1 for France',
      );

      const revenueKey = ValueKey('analytics-metric:revenueCents');
      final revenue = find.byKey(revenueKey);
      await _scrollTo(tester, revenue);
      await tester.tap(_tapTarget(revenue));
      await tester.pumpAndSettle();

      expect(
        find.text(
          'Revenue is aggregate-only; comparison with France is unavailable.',
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: revenue,
          matching: find.textContaining(r'$0.00'),
        ),
        findsNothing,
      );
      expect(
        find.descendant(
          of: revenue,
          matching: find.textContaining(r'$3.00'),
        ),
        findsOneWidget,
      );

      final data = _semanticsData(tester, revenue);
      expect(data.label, contains(r'Revenue: $3.00 overall'));
      expect(
        data.label,
        contains('Segment comparison with France is unavailable'),
      );

      final extractionErrors = find.byKey(
        const ValueKey('analytics-product:product.extraction.errors'),
      );
      await _scrollTo(tester, extractionErrors);
      expect(
        find.textContaining('Workflow and outcome events are not attributed'),
        findsOneWidget,
      );
      expect(
        _semanticsData(tester, extractionErrors).label,
        contains('Segment comparison with France is unavailable'),
      );

      final slowReady = find.byKey(
        const ValueKey('analytics-ready:performance.app_ready.over_8s'),
      );
      await _scrollTo(tester, slowReady);
      expect(
        find.textContaining('Readiness buckets are not attributed'),
        findsOneWidget,
      );
      expect(
        _semanticsData(tester, slowReady).label,
        contains('Segment comparison with France is unavailable'),
      );
      semantics.dispose();
    });

    testWidgets(
        'zero metric and long outcome reflow at 200 percent on a narrow screen',
        (tester) async {
      final selectedMetrics = <AnalyticsMetric>[];
      tester.view.physicalSize = const Size(320, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(
        _dashboard(
          textScaler: const TextScaler.linear(2),
          onMetricChanged: selectedMetrics.add,
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);

      const outcomeKey =
          ValueKey('analytics-product:product.outcomes.partially_approved');
      final outcome = find.byKey(outcomeKey);
      await _scrollTo(tester, outcome);
      await tester.tap(_tapTarget(outcome));
      await tester.pumpAndSettle();

      expect(selectedMetrics.last, AnalyticsMetric.outcomePartiallyApproved);
      final dailyTitle = find.text('Daily partially approved');
      await _scrollTo(tester, dailyTitle);
      expect(dailyTitle, findsOneWidget);
      expect(
        find.textContaining('No partially approved recorded yet'),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    });
  });
}

Future<void> _scrollTo(WidgetTester tester, Finder finder) async {
  if (finder.evaluate().isEmpty) {
    final verticalElement = find.byType(Scrollable).evaluate().firstWhere(
          (element) =>
              (element.widget as Scrollable).axisDirection ==
              AxisDirection.down,
        );
    final verticalScrollable = find.byElementPredicate(
      (element) => identical(element, verticalElement),
    );
    final position = tester.state<ScrollableState>(verticalScrollable).position;
    position.jumpTo(0);
    await tester.pump();
    for (var attempt = 0;
        attempt < 40 && finder.evaluate().isEmpty;
        attempt++) {
      final candidate = position.pixels + 420;
      final next = candidate > position.maxScrollExtent
          ? position.maxScrollExtent
          : candidate;
      position.jumpTo(next);
      await tester.pump();
    }
  }
  expect(finder, findsAtLeastNWidgets(1));
  await tester.ensureVisible(finder.first);
  await tester.pumpAndSettle();
}

Finder _tapTarget(Finder keyedControl) => find.descendant(
      of: keyedControl,
      matching: find.byType(InkWell),
    );

dynamic _semanticsData(WidgetTester tester, Finder keyedControl) {
  final semantics = find.descendant(
    of: keyedControl,
    matching: find.byType(Semantics),
  );
  expect(semantics, findsAtLeastNWidgets(1));
  return tester.getSemantics(semantics.first).getSemanticsData();
}

Widget _dashboard({
  AnalyticsFilter? selectedFilter,
  AnalyticsSummary? filtered,
  ValueChanged<AnalyticsMetric>? onMetricChanged,
  ValueChanged<String?>? onDayChanged,
  TextScaler textScaler = TextScaler.noScaling,
}) {
  return MaterialApp(
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(context).copyWith(textScaler: textScaler),
      child: child!,
    ),
    home: Scaffold(
      body: AnalyticsDashboardContent(
        overall: _overallSummary(),
        filtered: filtered,
        selectedFilter: selectedFilter,
        onFilterSelect: (_) {},
        onMetricChanged: onMetricChanged,
        onDayChanged: onDayChanged,
      ),
    ),
  );
}

AnalyticsSummary _overallSummary() => AnalyticsSummary.fromDocuments(
      const [
        AnalyticsDocument('2026-06-14', {
          'visits': 1,
          'pageviews': 2,
          'boots': 1,
          'revenueCents': 100,
          'funnel': {
            'upload': 1,
            'preview': 1,
            'checkout_started': 1,
            'paid': 1,
          },
          'product': {
            'extraction': {
              'started': 1,
              'completed': 1,
              'errors': {'validation': 1},
            },
            'preview': {'started': 1, 'completed': 1},
            'packet': {'started': 1, 'completed': 1},
            'case': {'submitted': 1},
            'outcomes': {'denied': 1},
          },
          'performance': {
            'app_ready': {'under_1s': 1},
          },
          'countries': {'FR': 1},
          'referrers': {'google.com': 1},
          'campaigns': {'launch': 1},
          'paths': {'/': 2},
        }),
        AnalyticsDocument('2026-07-13', {
          'visits': 2,
          'pageviews': 4,
          'boots': 3,
          'revenueCents': 200,
          'funnel': {
            'upload': 2,
            'preview': 2,
            'checkout_started': 2,
            'paid': 2,
          },
          'product': {
            'extraction': {
              'started': 2,
              'completed': 2,
              'errors': {'validation': 2},
            },
            'preview': {'started': 2, 'completed': 2},
            'packet': {'started': 2, 'completed': 2},
            'case': {'submitted': 2},
            'outcomes': {'approved': 2},
          },
          'performance': {
            'app_ready': {'over_8s': 2},
          },
          'countries': {'FR': 2},
          'referrers': {'google.com': 2},
          'campaigns': {'launch': 2},
          'paths': {'/': 4},
        }),
      ],
      now: DateTime.utc(2026, 7, 13, 23, 59),
    );

AnalyticsSummary _filteredSummary() => AnalyticsSummary.fromDocuments(
      const [
        AnalyticsDocument('2026-07-13', {
          'visits': 1,
          'pageviews': 2,
          'boots': 1,
          'countries': {'FR': 1},
          'referrers': {'google.com': 1},
          'campaigns': {'launch': 1},
          'paths': {'/': 2},
        }),
      ],
      now: DateTime.utc(2026, 7, 13, 23, 59),
    );

const _franceFilter = AnalyticsFilter(
  dimension: AnalyticsDimension.country,
  key: 'FR',
  label: 'France',
);
