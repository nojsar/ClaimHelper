import 'dart:ui' show SemanticsAction, Tristate;

import 'package:claimhelper/features/admin/analytics_summary.dart';
import 'package:claimhelper/features/admin/stats_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('AnalyticsSummary 30-day aggregation', () {
    test('zero-fills the range and aggregates totals and the last week', () {
      final summary = AnalyticsSummary.fromDocuments(
        const [
          AnalyticsDocument('2026-06-13', {'visits': 99}),
          AnalyticsDocument('2026-06-14', {
            'visits': 2,
            'pageviews': 3,
            'revenueCents': 100,
            'funnel': {'paid': 1},
          }),
          AnalyticsDocument('2026-07-06', {
            'visits': 5,
          }),
          AnalyticsDocument('2026-07-07', {
            'visits': 3,
            'pageviews': 6,
            'revenueCents': 250,
            'funnel': {'paid': 1},
          }),
          AnalyticsDocument('2026-07-13', {
            'visits': 4,
            'pageviews': 8,
            'revenueCents': 500,
            'funnel': {'paid': 2},
            'product': {
              'packet': {
                'completed': 2,
                'errors': {'rate_limit': 1},
              },
            },
          }),
        ],
        now: DateTime.utc(2026, 7, 13, 23, 59),
      );

      expect(summary.days, hasLength(30));
      expect(summary.days.first.key, '2026-06-14');
      expect(summary.days.last.key, '2026-07-13');
      expect(summary.total('visits'), 14);
      expect(summary.week('visits'), 7);
      expect(summary.total('pageviews'), 17);
      expect(summary.totalRevenueCents, 850);
      expect(summary.weekRevenueCents, 750);
      expect(summary.funnel('paid'), 4);
      expect(summary.pathTotal('product.packet.completed'), 2);
      expect(summary.pathWeek('product.packet.completed'), 2);
      expect(
        summary.pathsTotal(const [
          'product.packet.completed',
          'product.packet.errors.rate_limit',
        ]),
        3,
      );
      expect(summary.pathTotal('product.missing.value'), 0);
      expect(summary.days.where((day) => day.wasRecorded), hasLength(4));
    });
  });

  group('AnalyticsFilter document IDs', () {
    test('match the backend unpadded UTF-8 base64url format', () {
      const cases = <(AnalyticsFilter, String)>[
        (
          AnalyticsFilter(
            dimension: AnalyticsDimension.country,
            key: 'FR',
            label: 'France',
          ),
          '2026-07-13__country__RlI',
        ),
        (
          AnalyticsFilter(
            dimension: AnalyticsDimension.path,
            key: '/appeals/step-therapy',
            label: '/appeals/step-therapy',
          ),
          '2026-07-13__path__L2FwcGVhbHMvc3RlcC10aGVyYXB5',
        ),
        (
          AnalyticsFilter(
            dimension: AnalyticsDimension.campaign,
            key: 'summer | email | launch',
            label: 'Summer launch',
          ),
          '2026-07-13__campaign__c3VtbWVyIHwgZW1haWwgfCBsYXVuY2g',
        ),
      ];

      for (final (filter, expected) in cases) {
        final id = filter.documentId('2026-07-13');
        expect(id, expected);
        expect(id, isNot(contains('=')));
      }
    });
  });

  group('dimension primary counts', () {
    test('countries use visits while paths use pageviews', () {
      expect(AnalyticsDimension.country.primaryMetric, 'visits');
      expect(AnalyticsDimension.referrer.primaryMetric, 'visits');
      expect(AnalyticsDimension.campaign.primaryMetric, 'visits');
      expect(AnalyticsDimension.path.primaryMetric, 'pageviews');

      final summary = AnalyticsSummary.fromDocuments(
        const [
          AnalyticsDocument('2026-07-12', {
            'countries': {'FR': 3, 'US': 1},
            'paths': {'/': 4, '/appeals': 2},
          }),
          AnalyticsDocument('2026-07-13', {
            'countries': {'FR': 2},
            'paths': {'/': 1, '/appeals': 3},
          }),
        ],
        now: DateTime.utc(2026, 7, 13),
      );

      expect(
        summary.dimensionCount(const AnalyticsFilter(
          dimension: AnalyticsDimension.country,
          key: 'FR',
          label: 'France',
        )),
        5,
      );
      expect(
        summary.dimensionCount(const AnalyticsFilter(
          dimension: AnalyticsDimension.path,
          key: '/appeals',
          label: '/appeals',
        )),
        5,
      );
    });
  });

  group('aggregate unique-country estimates', () {
    test('merges daily sketches, deduplicates repeats, and sorts estimates',
        () {
      final summary = AnalyticsSummary.fromDocuments(
        const [
          AnalyticsDocument('2026-07-12', {
            'countries': {'FR': 900, 'US': 800},
          }),
        ],
        countrySketchDocuments: [
          AnalyticsDocument('fr-day-1', {
            'day': '2026-07-12',
            'type': 'country',
            'key': 'FR',
            'uniqueSketchVersion': UniqueVisitorSketch.version,
            'uniqueRegisters': _registers({3: 1, 9: 2}),
          }),
          AnalyticsDocument('fr-day-2', {
            'day': '2026-07-13',
            'type': 'country',
            'key': 'FR',
            'uniqueSketchVersion': UniqueVisitorSketch.version,
            // Index 3 is the same visitor bucket and must not be added again.
            'uniqueRegisters': _registers({3: 1, 18: 1}),
          }),
          AnalyticsDocument('us-day-1', {
            'day': '2026-07-13',
            'type': 'country',
            'key': 'US',
            'uniqueSketchVersion': UniqueVisitorSketch.version,
            'uniqueRegisters': _registers({44: 1}),
          }),
          AnalyticsDocument('legacy-outside-range', {
            'day': '2026-06-01',
            'type': 'country',
            'key': 'DE',
            'uniqueSketchVersion': UniqueVisitorSketch.version,
            'uniqueRegisters': _registers({1: 1}),
          }),
          AnalyticsDocument('incompatible-version', {
            'day': '2026-07-13',
            'type': 'country',
            'key': 'DE',
            'uniqueSketchVersion': UniqueVisitorSketch.version + 1,
            'uniqueRegisters': _registers({1: 8, 2: 8}),
          }),
        ],
        now: DateTime.utc(2026, 7, 13),
      );

      expect(
        summary.topCountries.map((entry) => (entry.key, entry.value)).toList(),
        const [('FR', 3), ('US', 1)],
      );
      // Legacy interaction totals must never be presented as unique visitors.
      expect(summary.topCountries, isNot(contains(const MapEntry('FR', 900))));
    });

    test('normalizes malformed registers and merges by maximum', () {
      final malformed = <Object?>[-3, 2.9, 999, double.nan, 'address'];
      expect(
        UniqueVisitorSketch.normalize(malformed).take(5),
        [0, 2, 64, 0, 0],
      );
      final merged = UniqueVisitorSketch.merge([
        _registers({1: 2, 2: 1}),
        _registers({1: 1, 2: 4}),
      ]);
      expect(merged[1], 2);
      expect(merged[2], 4);
      expect(UniqueVisitorSketch.estimate(_registers({1: 1})), 1);
    });
  });

  group('filtered cross-breakdowns', () {
    test('aggregate every breakdown within the selected segment', () {
      final filtered = AnalyticsSummary.fromDocuments(
        const [
          AnalyticsDocument('2026-07-12', {
            'visits': 4,
            'pageviews': 5,
            'boots': 1,
            'countries': {'FR': 4},
            'paths': {'/': 3, '/appeals': 2},
            'referrers': {'google.com': 4},
            'campaigns': {'summer': 1},
          }),
          AnalyticsDocument('2026-07-13', {
            'visits': 2,
            'pageviews': 3,
            'boots': 2,
            'countries': {'FR': 2},
            'paths': {'/': 1, '/appeals': 2},
            'referrers': {'google.com': 1, 'bing.com': 1},
            'campaigns': {'summer': 2},
          }),
        ],
        now: DateTime.utc(2026, 7, 13),
      );

      expect(filtered.total('visits'), 6);
      expect(filtered.total('pageviews'), 8);
      expect(filtered.total('boots'), 3);
      List<(String, int)> pairs(List<MapEntry<String, int>> entries) =>
          entries.map((entry) => (entry.key, entry.value)).toList();

      // Country rows never fall back to interaction counts. Unique-country
      // sketches are loaded separately by the production dashboard.
      expect(pairs(filtered.topCountries), isEmpty);
      expect(
        pairs(filtered.topPaths),
        const [('/', 4), ('/appeals', 4)],
      );
      expect(
        pairs(filtered.topReferrers),
        const [('google.com', 5), ('bing.com', 1)],
      );
      expect(pairs(filtered.topCampaigns), const [('summer', 3)]);
    });
  });

  group('legacy missing segment days', () {
    test('distinguish missing days from recorded zero-value days', () {
      final summary = AnalyticsSummary.fromDocuments(
        const [AnalyticsDocument('2026-07-12', {})],
        now: DateTime.utc(2026, 7, 13),
      );

      expect(summary.hasRecordedData, isTrue);
      expect(summary.firstRecordedDay, '2026-07-12');
      expect(summary.days.first.wasRecorded, isFalse);
      expect(
        summary.days.singleWhere((day) => day.key == '2026-07-12').wasRecorded,
        isTrue,
      );
      expect(summary.days.last.wasRecorded, isFalse);
      expect(summary.total('visits'), 0);

      final entirelyLegacy = AnalyticsSummary.fromDocuments(
        const [],
        now: DateTime.utc(2026, 7, 13),
      );
      expect(entirelyLegacy.hasRecordedData, isFalse);
      expect(entirelyLegacy.firstRecordedDay, isNull);
      expect(entirelyLegacy.days.every((day) => !day.wasRecorded), isTrue);
    });
  });

  group('AnalyticsFilter equality', () {
    test('uses dimension and key, not the presentation label', () {
      const france = AnalyticsFilter(
        dimension: AnalyticsDimension.country,
        key: 'FR',
        label: 'France',
      );
      const frenchUsers = AnalyticsFilter(
        dimension: AnalyticsDimension.country,
        key: 'FR',
        label: 'French users',
      );
      const franceAsPath = AnalyticsFilter(
        dimension: AnalyticsDimension.path,
        key: 'FR',
        label: 'France',
      );
      const unitedStates = AnalyticsFilter(
        dimension: AnalyticsDimension.country,
        key: 'US',
        label: 'United States',
      );

      expect(france, frenchUsers);
      expect(france.hashCode, frenchUsers.hashCode);
      expect(france, isNot(franceAsPath));
      expect(france, isNot(unitedStates));
      expect({france, frenchUsers, franceAsPath, unitedStates}, hasLength(3));
    });
  });

  group('AnalyticsBreakdownList', () {
    testWidgets('clicking a country emits the correct filter', (tester) async {
      AnalyticsFilter? emitted;
      await tester.pumpWidget(_countryList(
        onSelect: (filter) => emitted = filter,
      ));

      await tester.tap(find.byKey(const ValueKey('country:FR')));
      await tester.pump();

      expect(
        emitted,
        const AnalyticsFilter(
          dimension: AnalyticsDimension.country,
          key: 'FR',
          label: 'France',
        ),
      );
      expect(emitted?.label, 'France');
    });

    testWidgets('active filter renders overall and filtered values with state',
        (tester) async {
      final semantics = tester.ensureSemantics();

      await tester.pumpWidget(_countryList(
        selectedFilter: _franceFilter,
        filteredEntries: const [
          MapEntry('FR', 7),
          MapEntry('US', 3),
        ],
      ));

      expect(find.text('All | France'), findsOneWidget);
      // A selected dimension keeps its exact historical primary total.
      expect(find.text('12 | 12'), findsOneWidget);
      expect(find.text('8 | 3'), findsOneWidget);

      final selected = tester
          .getSemantics(find.bySemanticsLabel(
            'France, 12 overall, 12 filtered',
          ))
          .getSemanticsData();
      expect(selected.flagsCollection.isButton, isTrue);
      expect(selected.flagsCollection.isSelected, Tristate.isTrue);
      expect(selected.hasAction(SemanticsAction.tap), isTrue);
      semantics.dispose();
    });

    testWidgets('clicking the selected row emits the same filter for toggling',
        (tester) async {
      AnalyticsFilter? emitted;
      await tester.pumpWidget(_countryList(
        selectedFilter: _franceFilter,
        filteredEntries: const [MapEntry('FR', 7)],
        onSelect: (filter) => emitted = filter,
      ));

      await tester.tap(find.byKey(const ValueKey('country:FR')));
      await tester.pump();

      expect(emitted, _franceFilter);
      expect(emitted?.label, _franceFilter.label);
    });

    testWidgets('overall-only lists do not imply unsupported comparisons',
        (tester) async {
      await tester.pumpWidget(_countryList(
        selectedFilter: _franceFilter,
        compareWithActiveFilter: false,
      ));

      expect(find.text('All | France'), findsNothing);
      expect(find.text('12'), findsOneWidget);
      expect(find.text('12 | 12'), findsNothing);
    });

    testWidgets('reflows at 200 percent text on a 320 pixel viewport',
        (tester) async {
      tester.view.physicalSize = const Size(320, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(_countryList(
        selectedFilter: _franceFilter,
        filteredEntries: const [
          MapEntry('FR', 7),
          MapEntry('US', 3),
        ],
        textScaler: const TextScaler.linear(2),
      ));
      await tester.pump();

      expect(tester.takeException(), isNull);
      expect(find.text('All | France'), findsOneWidget);
      expect(find.text('12 | 12'), findsOneWidget);
      expect(find.text('8 | 3'), findsOneWidget);
    });
  });
}

List<int> _registers(Map<int, int> values) {
  final registers = List<int>.filled(UniqueVisitorSketch.registerCount, 0);
  values.forEach((index, value) => registers[index] = value);
  return registers;
}

const _franceFilter = AnalyticsFilter(
  dimension: AnalyticsDimension.country,
  key: 'FR',
  label: 'France',
);

Widget _countryList({
  AnalyticsFilter? selectedFilter,
  List<MapEntry<String, int>>? filteredEntries,
  ValueChanged<AnalyticsFilter>? onSelect,
  TextScaler textScaler = TextScaler.noScaling,
  bool compareWithActiveFilter = true,
}) {
  return MaterialApp(
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(context).copyWith(textScaler: textScaler),
      child: child!,
    ),
    home: Scaffold(
      body: AnalyticsBreakdownList(
        dimension: AnalyticsDimension.country,
        entries: const [
          MapEntry('FR', 12),
          MapEntry('US', 8),
        ],
        filteredEntries: filteredEntries,
        selectedFilter: selectedFilter,
        onSelect: onSelect ?? (_) {},
        emptyLabel: 'No countries.',
        labelForKey: (key) => switch (key) {
          'FR' => 'France',
          'US' => 'United States',
          _ => key,
        },
        compareWithActiveFilter: compareWithActiveFilter,
      ),
    ),
  );
}
