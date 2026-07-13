import 'dart:convert';

import 'package:intl/intl.dart';

/// A single selectable analytics breakdown.
enum AnalyticsDimension {
  country('country', 'country', 'countries', 'Country'),
  referrer('referrer', 'referrer', 'referrers', 'Referrer'),
  campaign('campaign', 'campaign', 'campaigns', 'Campaign'),
  path('path', 'page', 'paths', 'Page');

  const AnalyticsDimension(
    this.storageName,
    this.singularLabel,
    this.mapField,
    this.displayLabel,
  );

  final String storageName;
  final String singularLabel;
  final String mapField;
  final String displayLabel;

  /// The metric represented by this dimension's existing aggregate map.
  String get primaryMetric => this == path ? 'pageviews' : 'visits';
}

/// The currently active, single-dimension dashboard filter.
class AnalyticsFilter {
  const AnalyticsFilter({
    required this.dimension,
    required this.key,
    required this.label,
  });

  final AnalyticsDimension dimension;
  final String key;
  final String label;

  String documentId(String day) {
    final encoded = base64Url.encode(utf8.encode(key)).replaceAll('=', '');
    return '${day}__${dimension.storageName}__$encoded';
  }

  @override
  bool operator ==(Object other) =>
      other is AnalyticsFilter &&
      other.dimension == dimension &&
      other.key == key;

  @override
  int get hashCode => Object.hash(dimension, key);
}

/// Firestore-independent input used by the dashboard and unit tests.
class AnalyticsDocument {
  const AnalyticsDocument(this.id, this.data);

  final String id;
  final Map<String, dynamic> data;
}

/// One day's counters.
class AnalyticsDay {
  const AnalyticsDay(this.key, this.data, {required this.wasRecorded});

  final String key;
  final Map<String, dynamic> data;

  /// False when this day was zero-filled because no source document existed.
  final bool wasRecorded;

  int count(String field) => ((data[field] ?? 0) as num).toInt();

  int funnelCount(String step) =>
      (((data['funnel'] as Map<String, dynamic>?)?[step] ?? 0) as num).toInt();
}

/// Thirty-day analytics view model shared by the production screen and tests.
class AnalyticsSummary {
  const AnalyticsSummary(this.days);

  /// Oldest to newest, exactly 30 entries (missing days are zero-filled).
  final List<AnalyticsDay> days;

  factory AnalyticsSummary.fromDocuments(
    Iterable<AnalyticsDocument> documents, {
    DateTime? now,
  }) {
    final byKey = {
      for (final document in documents) document.id: document.data
    };
    final today = (now ?? DateTime.now()).toUtc();
    final days = List.generate(30, (index) {
      final date = today.subtract(Duration(days: 29 - index));
      final key = DateFormat('yyyy-MM-dd').format(date);
      return AnalyticsDay(
        key,
        byKey[key] ?? const {},
        wasRecorded: byKey.containsKey(key),
      );
    });
    return AnalyticsSummary(days);
  }

  bool get hasRecordedData => days.any((day) => day.wasRecorded);

  String? get firstRecordedDay {
    for (final day in days) {
      if (day.wasRecorded) return day.key;
    }
    return null;
  }

  int total(String field) =>
      days.fold(0, (total, day) => total + day.count(field));

  int week(String field) => days
      .skip(days.length - 7)
      .fold(0, (total, day) => total + day.count(field));

  int funnel(String step) =>
      days.fold(0, (total, day) => total + day.funnelCount(step));

  int get totalRevenueCents => total('revenueCents');
  int get weekRevenueCents => week('revenueCents');

  List<MapEntry<String, int>> topOf(String mapField, {int limit = 10}) {
    final merged = <String, int>{};
    for (final day in days) {
      (day.data[mapField] as Map<String, dynamic>? ?? const {}).forEach(
        (key, value) =>
            merged[key] = (merged[key] ?? 0) + (value as num).toInt(),
      );
    }
    final entries = merged.entries.toList()
      ..sort((a, b) {
        final byValue = b.value.compareTo(a.value);
        return byValue != 0 ? byValue : a.key.compareTo(b.key);
      });
    return entries.take(limit).toList();
  }

  int dimensionCount(AnalyticsFilter filter) => topOf(
        filter.dimension.mapField,
        limit: 10000,
      )
          .where((entry) => entry.key == filter.key)
          .fold(0, (total, entry) => total + entry.value);

  List<MapEntry<String, int>> get topReferrers => topOf('referrers');
  List<MapEntry<String, int>> get topCampaigns => topOf('campaigns');
  List<MapEntry<String, int>> get topPaths => topOf('paths');
  List<MapEntry<String, int>> get topCountries => topOf('countries');
}
