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

  group('AnalyticsMetric aggregation', () {
    test('reads every traffic, funnel, product, outcome, and readiness metric',
        () {
      final summary = _metricSummary();
      final latest = summary.day('2026-07-13');
      expect(latest, isNotNull);

      final expected = <AnalyticsMetric, int>{
        AnalyticsMetric.visits: 2,
        AnalyticsMetric.pageviews: 3,
        AnalyticsMetric.appOpens: 4,
        AnalyticsMetric.revenue: 505,
        AnalyticsMetric.uploadedDenial: 5,
        AnalyticsMetric.extractedFacts: 6,
        AnalyticsMetric.sawPreview: 7,
        AnalyticsMetric.startedCheckout: 8,
        AnalyticsMetric.paid: 9,
        AnalyticsMetric.packetReady: 10,
        AnalyticsMetric.submittedAppeal: 11,
        AnalyticsMetric.extractionStarted: 12,
        AnalyticsMetric.extractionErrors: 14,
        AnalyticsMetric.previewStarted: 13,
        AnalyticsMetric.previewCompleted: 14,
        AnalyticsMetric.previewErrors: 4,
        AnalyticsMetric.packetStarted: 15,
        AnalyticsMetric.packetErrors: 8,
        AnalyticsMetric.outcomeApproved: 16,
        AnalyticsMetric.outcomePartiallyApproved: 17,
        AnalyticsMetric.outcomeDenied: 18,
        AnalyticsMetric.outcomeWithdrawn: 19,
        AnalyticsMetric.readyUnderOneSecond: 20,
        AnalyticsMetric.readyOneToTwoSeconds: 21,
        AnalyticsMetric.readyTwoToFourSeconds: 22,
        AnalyticsMetric.readyFourToEightSeconds: 23,
        AnalyticsMetric.readyOverEightSeconds: 24,
      };

      expect(expected.keys, containsAll(AnalyticsMetric.values));
      expect(expected, hasLength(AnalyticsMetric.values.length));
      for (final entry in expected.entries) {
        expect(
          entry.key.valueForDay(latest!),
          entry.value,
          reason: '${entry.key.name} should read ${entry.key.id}',
        );
      }
    });

    test('computes 30-day and seven-day totals for each metric family', () {
      final summary = _metricSummary();

      expect(AnalyticsMetric.visits.total(summary), 3);
      expect(AnalyticsMetric.visits.week(summary), 2);
      expect(AnalyticsMetric.uploadedDenial.total(summary), 6);
      expect(AnalyticsMetric.uploadedDenial.week(summary), 5);
      expect(AnalyticsMetric.extractionStarted.total(summary), 13);
      expect(AnalyticsMetric.extractionStarted.week(summary), 12);
      expect(AnalyticsMetric.extractionErrors.total(summary), 18);
      expect(AnalyticsMetric.extractionErrors.week(summary), 14);
      expect(AnalyticsMetric.outcomeApproved.total(summary), 17);
      expect(AnalyticsMetric.outcomeApproved.week(summary), 16);
      expect(AnalyticsMetric.readyOverEightSeconds.total(summary), 25);
      expect(AnalyticsMetric.readyOverEightSeconds.week(summary), 24);
    });

    test('formats revenue as currency while keeping count formatting', () {
      final summary = _metricSummary();

      expect(AnalyticsMetric.revenue.isMoney, isTrue);
      expect(AnalyticsMetric.revenue.total(summary), 700);
      expect(AnalyticsMetric.revenue.week(summary), 505);
      expect(AnalyticsMetric.revenue.format(700), r'$7.00');
      expect(AnalyticsMetric.revenue.format(505), r'$5.05');
      expect(AnalyticsMetric.visits.isMoney, isFalse);
      expect(AnalyticsMetric.visits.format(1234), contains('1'));
      expect(AnalyticsMetric.visits.format(1234), contains('234'));
    });

    test('only public traffic counters allow segment comparison', () {
      expect(
        AnalyticsMetric.values
            .where((metric) => metric.supportsSegmentComparison)
            .toSet(),
        {
          AnalyticsMetric.visits,
          AnalyticsMetric.pageviews,
          AnalyticsMetric.appOpens,
        },
      );
      expect(AnalyticsMetric.revenue.supportsSegmentComparison, isFalse);
      expect(AnalyticsMetric.paid.supportsSegmentComparison, isFalse);
      expect(
        AnalyticsMetric.extractionErrors.supportsSegmentComparison,
        isFalse,
      );
      expect(
        AnalyticsMetric.readyUnderOneSecond.supportsSegmentComparison,
        isFalse,
      );
    });
  });

  group('AnalyticsSummary day scoping', () {
    test('finds a day and retains only that day in dashboard totals', () {
      final summary = _metricSummary();

      expect(summary.day('2026-07-13')?.wasRecorded, isTrue);
      expect(summary.day('2030-01-01'), isNull);
      expect(summary.scopedToDay(null), same(summary));

      final scoped = summary.scopedToDay('2026-07-13');
      expect(scoped.days, hasLength(30));
      expect(scoped.hasRecordedData, isTrue);
      expect(scoped.firstRecordedDay, '2026-07-13');
      expect(scoped.days.where((day) => day.wasRecorded), hasLength(1));
      expect(AnalyticsMetric.visits.total(scoped), 2);
      expect(AnalyticsMetric.visits.week(scoped), 2);
      expect(AnalyticsMetric.revenue.total(scoped), 505);
      expect(AnalyticsMetric.uploadedDenial.total(scoped), 5);
      expect(AnalyticsMetric.packetErrors.total(scoped), 8);
      expect(AnalyticsMetric.outcomeDenied.total(scoped), 18);
      expect(AnalyticsMetric.readyTwoToFourSeconds.total(scoped), 22);
    });

    test('an unknown or zero-filled date scopes to an honest empty view', () {
      final summary = _metricSummary();

      final unknown = summary.scopedToDay('2030-01-01');
      expect(unknown.hasRecordedData, isFalse);
      expect(unknown.firstRecordedDay, isNull);
      expect(
          AnalyticsMetric.values.every((metric) => metric.total(unknown) == 0),
          isTrue);

      final zeroFilled = summary.scopedToDay('2026-07-12');
      expect(zeroFilled.hasRecordedData, isFalse);
      expect(zeroFilled.day('2026-07-12')?.wasRecorded, isFalse);
      expect(AnalyticsMetric.visits.total(zeroFilled), 0);
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

      expect(find.text('All visits | France visits'), findsOneWidget);
      // A selected dimension keeps its exact historical primary total.
      expect(find.text('12 · Selected'), findsOneWidget);
      expect(find.text('8 | 3'), findsOneWidget);

      final selected = tester
          .getSemantics(find.bySemanticsLabel(
            'France, 12 overall, selected filter. Activate to clear this filter.',
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

      expect(find.text('All visits | France visits'), findsNothing);
      expect(find.text('12'), findsOneWidget);
      expect(find.text('12 · Selected'), findsNothing);
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
      expect(find.text('All visits | France visits'), findsOneWidget);
      expect(find.text('12 · Selected'), findsOneWidget);
      expect(find.text('8 | 3'), findsOneWidget);
    });
  });
}

AnalyticsSummary _metricSummary() => AnalyticsSummary.fromDocuments(
      const [
        AnalyticsDocument('2026-06-14', {
          'visits': 1,
          'pageviews': 1,
          'boots': 1,
          'revenueCents': 195,
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
              'errors': {
                'validation': 1,
                'rate_limit': 1,
                'missing_prerequisite': 1,
                'model_failure': 1,
              },
            },
            'preview': {
              'started': 1,
              'completed': 1,
              'errors': {
                'validation': 1,
                'rate_limit': 1,
                'missing_prerequisite': 1,
                'model_failure': 1,
              },
            },
            'packet': {
              'started': 1,
              'completed': 1,
              'errors': {
                'validation': 1,
                'rate_limit': 1,
                'missing_prerequisite': 1,
                'model_failure': 1,
              },
            },
            'case': {'submitted': 1},
            'outcomes': {
              'approved': 1,
              'partially_approved': 1,
              'denied': 1,
              'withdrawn': 1,
            },
          },
          'performance': {
            'app_ready': {
              'under_1s': 1,
              '1_to_2s': 1,
              '2_to_4s': 1,
              '4_to_8s': 1,
              'over_8s': 1,
            },
          },
        }),
        AnalyticsDocument('2026-07-13', {
          'visits': 2,
          'pageviews': 3,
          'boots': 4,
          'revenueCents': 505,
          'funnel': {
            'upload': 5,
            'preview': 7,
            'checkout_started': 8,
            'paid': 9,
          },
          'product': {
            'extraction': {
              'started': 12,
              'completed': 6,
              'errors': {
                'validation': 2,
                'rate_limit': 3,
                'missing_prerequisite': 4,
                'model_failure': 5,
              },
            },
            'preview': {
              'started': 13,
              'completed': 14,
              'errors': {
                'validation': 1,
                'rate_limit': 1,
                'missing_prerequisite': 1,
                'model_failure': 1,
              },
            },
            'packet': {
              'started': 15,
              'completed': 10,
              'errors': {
                'validation': 2,
                'rate_limit': 2,
                'missing_prerequisite': 2,
                'model_failure': 2,
              },
            },
            'case': {'submitted': 11},
            'outcomes': {
              'approved': 16,
              'partially_approved': 17,
              'denied': 18,
              'withdrawn': 19,
            },
          },
          'performance': {
            'app_ready': {
              'under_1s': 20,
              '1_to_2s': 21,
              '2_to_4s': 22,
              '4_to_8s': 23,
              'over_8s': 24,
            },
          },
        }),
      ],
      now: DateTime.utc(2026, 7, 13, 23, 59),
    );

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
