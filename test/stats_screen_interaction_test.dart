import 'dart:ui' show SemanticsAction, Tristate;

import 'package:claimhelper/features/admin/analytics_summary.dart';
import 'package:claimhelper/features/admin/stats_screen.dart';
import 'package:country_flags/country_flags.dart' as country_flags;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('AnalyticsDashboardContent interactions', () {
    testWidgets(
        'explains traffic, purchase, submission, and country boundaries',
        (tester) async {
      final semantics = tester.ensureSemantics();
      await tester.pumpWidget(_dashboard());

      expect(find.textContaining('Stripe Transactions'), findsOneWidget);
      expect(find.textContaining('authoritative'), findsOneWidget);

      const paidKey = ValueKey('analytics-metric:funnel.paid');
      const submittedKey = ValueKey('analytics-metric:product.case.submitted');
      const startedKey =
          ValueKey('analytics-metric:intent.start_appeal_clicked');
      const documentKey = ValueKey('analytics-metric:intent.document_added');
      final paid = find.byKey(paidKey);
      final submitted = find.byKey(submittedKey);
      expect(paid, findsOneWidget);
      expect(submitted, findsOneWidget);
      expect(find.byKey(startedKey), findsOneWidget);
      expect(find.byKey(documentKey), findsOneWidget);
      expect(find.text('Started appeal'), findsWidgets);
      expect(find.text('Added document'), findsWidgets);
      expect(
        find.descendant(of: paid, matching: find.text('Paid packages')),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: submitted,
          matching: find.text('Submitted appeals'),
        ),
        findsOneWidget,
      );
      expect(_semanticsData(tester, paid).flagsCollection.isButton, isTrue);
      expect(
        _semanticsData(tester, submitted).flagsCollection.isButton,
        isTrue,
      );

      final routeMeaning = find.textContaining(
        'does not mean an appeal was created or submitted',
      );
      await _scrollTo(tester, routeMeaning);
      expect(routeMeaning, findsOneWidget);
      expect(
        find.textContaining('count pageviews, not unique visitors or customer'),
        findsOneWidget,
      );

      final countryMeaning = find.textContaining(
        'not linked to a page, case, submission, or payment',
      );
      await _scrollTo(tester, countryMeaning);
      expect(countryMeaning, findsOneWidget);
      semantics.dispose();
    });

    testWidgets(
        'country rows render vector flags and remain accessible filters',
        (tester) async {
      final selectedFilters = <AnalyticsFilter>[];
      final semantics = tester.ensureSemantics();
      await tester.pumpWidget(
        _dashboard(
          overall: _overallSummaryWithCountries(),
          onFilterSelect: selectedFilters.add,
        ),
      );
      await tester.pumpAndSettle();

      for (final code in const ['US', 'LT', 'FR', 'RU']) {
        final row = find.byKey(ValueKey('country:$code'));
        await _scrollTo(tester, row);

        final flagFinder = find.descendant(
          of: row,
          matching: find.byKey(ValueKey('country-flag:$code')),
        );
        expect(flagFinder, findsOneWidget);
        final flag = tester.widget<country_flags.CountryFlag>(flagFinder);
        expect(flag.flagCode, code.toLowerCase());
        expect(flag.theme, isA<country_flags.ImageTheme>());
        expect(
          find.descendant(of: row, matching: find.text(code)),
          findsOneWidget,
        );
        expect(
          find.descendant(
            of: row,
            matching: find.byWidgetPredicate(_hasRegionalIndicatorText),
          ),
          findsNothing,
        );

        final data = _semanticsData(tester, row);
        expect(data.flagsCollection.isButton, isTrue);
        expect(data.hasAction(SemanticsAction.tap), isTrue);
        expect(data.label, contains(code));

        await tester.tap(_tapTarget(row));
        await tester.pump();
        expect(selectedFilters.last.dimension, AnalyticsDimension.country);
        expect(selectedFilters.last.key, code);
      }

      expect(tester.takeException(), isNull);
      semantics.dispose();
    });

    testWidgets('country flags reflow at 200 percent text on a narrow screen',
        (tester) async {
      final selectedFilters = <AnalyticsFilter>[];
      final semantics = tester.ensureSemantics();
      tester.view.physicalSize = const Size(320, 1000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(
        _dashboard(
          overall: _overallSummaryWithCountries(),
          textScaler: const TextScaler.linear(2),
          onFilterSelect: selectedFilters.add,
        ),
      );
      await tester.pumpAndSettle();

      for (final code in const ['US', 'LT', 'FR', 'RU']) {
        final row = find.byKey(ValueKey('country:$code'));
        await _scrollTo(tester, row);

        expect(
          find.descendant(
            of: row,
            matching: find.byKey(ValueKey('country-flag:$code')),
          ),
          findsOneWidget,
        );
        expect(
          find.descendant(of: row, matching: find.text(code)),
          findsOneWidget,
        );
        final rect = tester.getRect(row);
        expect(rect.left, greaterThanOrEqualTo(0));
        expect(rect.right, lessThanOrEqualTo(320));
        expect(_semanticsData(tester, row).flagsCollection.isButton, isTrue);
      }

      final france = find.byKey(const ValueKey('country:FR'));
      await _scrollTo(tester, france);
      await tester.tap(_tapTarget(france));
      await tester.pump();
      expect(selectedFilters.last.key, 'FR');
      expect(tester.takeException(), isNull);
      semantics.dispose();
    });

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
      expect(find.text('Customer journey (Jul 13)'), findsOneWidget);
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
        'selected page route shows selected state instead of a self-comparison',
        (tester) async {
      final semantics = tester.ensureSemantics();
      await tester.pumpWidget(
        _dashboard(selectedFilter: _appealsFilter),
      );

      const rowKey = ValueKey('path:/appeals');
      final row = find.byKey(rowKey);
      await _scrollTo(tester, row);

      expect(
        find.descendant(of: row, matching: find.text('1 · Selected')),
        findsOneWidget,
      );
      expect(
        find.descendant(of: row, matching: find.text('1 | 1')),
        findsNothing,
      );
      final data = _semanticsData(tester, row);
      expect(data.flagsCollection.isButton, isTrue);
      expect(data.flagsCollection.isSelected, Tristate.isTrue);
      expect(data.hasAction(SemanticsAction.tap), isTrue);
      expect(data.label.toLowerCase(), contains('selected'));
      expect(data.label.toLowerCase(), isNot(contains('filtered')));
      semantics.dispose();
    });

    testWidgets('desktop daily chart fits all 30 accessible day targets',
        (tester) async {
      tester.view.physicalSize = const Size(920, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(_dashboard());

      const chartKey = ValueKey('analytics-daily-chart');
      final chart = find.byKey(chartKey);
      await _scrollTo(tester, chart);
      final horizontal = _horizontalScrollable(chart);
      final position = tester.state<ScrollableState>(horizontal).position;

      expect(position.maxScrollExtent, 0);
      expect(
        find.descendant(of: chart, matching: find.byType(Scrollbar)),
        findsNothing,
      );
      final dayTargets = _dayTargets(chart);
      expect(dayTargets, findsNWidgets(30));
      for (var index = 0; index < 30; index++) {
        expect(
          tester.getSize(dayTargets.at(index)).width,
          greaterThanOrEqualTo(24),
        );
      }
    });

    testWidgets('narrow daily chart scrolls and starts on its newest day',
        (tester) async {
      tester.view.physicalSize = const Size(320, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(_dashboard());

      const chartKey = ValueKey('analytics-daily-chart');
      final chart = find.byKey(chartKey);
      await _scrollTo(tester, chart);
      final horizontal = _horizontalScrollable(chart);
      final position = tester.state<ScrollableState>(horizontal).position;

      expect(position.maxScrollExtent, greaterThan(0));
      expect(position.pixels, closeTo(position.maxScrollExtent, 0.1));
      expect(
        find.descendant(of: chart, matching: find.byType(Scrollbar)),
        findsOneWidget,
      );
      final dayTargets = _dayTargets(chart);
      expect(dayTargets, findsNWidgets(30));
      for (var index = 0; index < 30; index++) {
        expect(
          tester.getSize(dayTargets.at(index)).width,
          greaterThanOrEqualTo(24),
        );
      }

      const newestKey = ValueKey('analytics-day:2026-07-13');
      final viewport = tester.getRect(horizontal);
      final newest = tester.getRect(find.byKey(newestKey));
      expect(newest.left, greaterThanOrEqualTo(viewport.left - 0.1));
      expect(newest.right, lessThanOrEqualTo(viewport.right + 0.1));
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
      expect(find.text('Started upload'), findsOneWidget);
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
        'monetization and model values are accessible overall-only daily metrics',
        (tester) async {
      final selectedMetrics = <AnalyticsMetric>[];
      final semantics = tester.ensureSemantics();
      await tester.pumpWidget(
        _dashboard(onMetricChanged: selectedMetrics.add),
      );

      const packetRevenueKey =
          ValueKey('analytics-product:monetization.packet.netRevenueCents');
      final packetRevenue = find.byKey(packetRevenueKey);
      await _scrollTo(tester, packetRevenue);
      await tester.tap(_tapTarget(packetRevenue));
      await tester.pumpAndSettle();
      expect(selectedMetrics.last, AnalyticsMetric.packetNetRevenue);
      final revenueData = _semanticsData(tester, packetRevenue);
      expect(revenueData.flagsCollection.isButton, isTrue);
      expect(revenueData.flagsCollection.isSelected, Tristate.isTrue);

      const extractionModelCallsKey =
          ValueKey('analytics-product:model.operations.extraction.calls');
      final extractionModelCalls = find.byKey(extractionModelCallsKey);
      await _scrollTo(tester, extractionModelCalls);
      await tester.tap(_tapTarget(extractionModelCalls));
      await tester.pumpAndSettle();
      expect(selectedMetrics.last, AnalyticsMetric.modelExtractionCalls);
      final modelData = _semanticsData(tester, extractionModelCalls);
      expect(modelData.flagsCollection.isButton, isTrue);
      expect(modelData.flagsCollection.isSelected, Tristate.isTrue);
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
        attempt < 80 && finder.evaluate().isEmpty;
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

Finder _horizontalScrollable(Finder chart) => find.descendant(
      of: chart,
      matching: find.byWidgetPredicate(
        (widget) =>
            widget is Scrollable &&
            (widget.axisDirection == AxisDirection.left ||
                widget.axisDirection == AxisDirection.right),
      ),
    );

Finder _dayTargets(Finder chart) => find.descendant(
      of: chart,
      matching: find.byWidgetPredicate((widget) {
        final key = widget.key;
        return key is ValueKey<String> &&
            key.value.startsWith('analytics-day:');
      }),
    );

dynamic _semanticsData(WidgetTester tester, Finder keyedControl) {
  final semantics = find.descendant(
    of: keyedControl,
    matching: find.byType(Semantics),
  );
  expect(semantics, findsAtLeastNWidgets(1));
  return tester.getSemantics(semantics.first).getSemanticsData();
}

bool _hasRegionalIndicatorText(Widget widget) {
  if (widget is! Text) return false;
  final value = widget.data ?? widget.textSpan?.toPlainText() ?? '';
  return value.runes.any((rune) => rune >= 0x1F1E6 && rune <= 0x1F1FF);
}

Widget _dashboard({
  AnalyticsSummary? overall,
  AnalyticsFilter? selectedFilter,
  AnalyticsSummary? filtered,
  ValueChanged<AnalyticsFilter>? onFilterSelect,
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
        overall: overall ?? _overallSummary(),
        filtered: filtered,
        selectedFilter: selectedFilter,
        onFilterSelect: onFilterSelect ?? (_) {},
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
          'intent': {
            'start_appeal_clicked': 1,
            'document_added': 1,
          },
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
          'paths': {'/': 1, '/appeals': 1},
        }),
        AnalyticsDocument('2026-07-13', {
          'visits': 2,
          'pageviews': 4,
          'boots': 3,
          'intent': {
            'start_appeal_clicked': 2,
            'document_added': 1,
          },
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

AnalyticsSummary _overallSummaryWithCountries() {
  final overall = _overallSummary();
  return AnalyticsSummary(
    overall.days,
    topCountries: const [
      MapEntry('US', 7),
      MapEntry('LT', 4),
      MapEntry('FR', 1),
      MapEntry('RU', 1),
    ],
  );
}

AnalyticsSummary _filteredSummary() => AnalyticsSummary.fromDocuments(
      const [
        AnalyticsDocument('2026-07-13', {
          'visits': 1,
          'pageviews': 2,
          'boots': 1,
          'intent': {
            'start_appeal_clicked': 1,
            'document_added': 1,
          },
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

const _appealsFilter = AnalyticsFilter(
  dimension: AnalyticsDimension.path,
  key: '/appeals',
  label: '/appeals',
);
