import 'dart:convert';
import 'dart:math' as math;

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

  int pathCount(String path) {
    Object? value = data;
    for (final segment in path.split('.')) {
      if (value is! Map || !value.containsKey(segment)) return 0;
      value = value[segment];
    }
    return value is num ? value.toInt() : 0;
  }

  int funnelCount(String step) =>
      (((data['funnel'] as Map<String, dynamic>?)?[step] ?? 0) as num).toInt();
}

/// A safe, aggregate-only statistic that can be focused in the dashboard.
///
/// These metrics are evaluated from the already-bounded daily documents. They
/// never turn revenue, funnel, product, or performance data into a user cohort.
enum AnalyticsMetric {
  visits('visits', 'Visits'),
  pageviews('pageviews', 'Pageviews'),
  appOpens('boots', 'App opens'),
  revenue('revenueCents', 'Revenue'),
  uploadedDenial('funnel.upload', 'Uploaded denial'),
  extractedFacts('product.extraction.completed', 'Extracted facts'),
  sawPreview('funnel.preview', 'Saw preview'),
  startedCheckout('funnel.checkout_started', 'Started checkout'),
  paid('funnel.paid', 'Paid'),
  packetReady('product.packet.completed', 'Packet ready'),
  submittedAppeal('product.case.submitted', 'Submitted appeal'),
  extractionStarted('product.extraction.started', 'Extraction started'),
  extractionErrors('product.extraction.errors', 'Extraction errors'),
  previewStarted('product.preview.started', 'Preview started'),
  previewCompleted('product.preview.completed', 'Preview completed'),
  previewErrors('product.preview.errors', 'Preview errors'),
  packetStarted('product.packet.started', 'Packet started'),
  packetErrors('product.packet.errors', 'Packet errors'),
  outcomeApproved('product.outcomes.approved', 'Approved'),
  outcomePartiallyApproved(
      'product.outcomes.partially_approved', 'Partially approved'),
  outcomeDenied('product.outcomes.denied', 'Denied'),
  outcomeWithdrawn('product.outcomes.withdrawn', 'Withdrawn'),
  readyUnderOneSecond('performance.app_ready.under_1s', 'Ready under 1 second'),
  readyOneToTwoSeconds('performance.app_ready.1_to_2s', 'Ready in 1–2 seconds'),
  readyTwoToFourSeconds(
      'performance.app_ready.2_to_4s', 'Ready in 2–4 seconds'),
  readyFourToEightSeconds(
      'performance.app_ready.4_to_8s', 'Ready in 4–8 seconds'),
  readyOverEightSeconds(
      'performance.app_ready.over_8s', 'Ready over 8 seconds');

  const AnalyticsMetric(this.id, this.label);

  final String id;
  final String label;

  bool get isMoney => this == revenue;

  /// Only public traffic counters exist inside country/referrer/campaign/path
  /// segment documents. All other metrics must remain overall-only.
  bool get supportsSegmentComparison =>
      this == visits || this == pageviews || this == appOpens;

  String format(int value) => isMoney
      ? '\$${(value / 100).toStringAsFixed(2)}'
      : NumberFormat.decimalPattern().format(value);

  int valueForDay(AnalyticsDay day) => switch (this) {
        visits => day.count('visits'),
        pageviews => day.count('pageviews'),
        appOpens => day.count('boots'),
        revenue => day.count('revenueCents'),
        uploadedDenial => day.funnelCount('upload'),
        extractedFacts => day.pathCount('product.extraction.completed'),
        sawPreview => day.funnelCount('preview'),
        startedCheckout => day.funnelCount('checkout_started'),
        paid => day.funnelCount('paid'),
        packetReady => day.pathCount('product.packet.completed'),
        submittedAppeal => day.pathCount('product.case.submitted'),
        extractionStarted => day.pathCount('product.extraction.started'),
        extractionErrors => _stageErrors(day, 'extraction'),
        previewStarted => day.pathCount('product.preview.started'),
        previewCompleted => day.pathCount('product.preview.completed'),
        previewErrors => _stageErrors(day, 'preview'),
        packetStarted => day.pathCount('product.packet.started'),
        packetErrors => _stageErrors(day, 'packet'),
        outcomeApproved => day.pathCount('product.outcomes.approved'),
        outcomePartiallyApproved =>
          day.pathCount('product.outcomes.partially_approved'),
        outcomeDenied => day.pathCount('product.outcomes.denied'),
        outcomeWithdrawn => day.pathCount('product.outcomes.withdrawn'),
        readyUnderOneSecond => day.pathCount('performance.app_ready.under_1s'),
        readyOneToTwoSeconds => day.pathCount('performance.app_ready.1_to_2s'),
        readyTwoToFourSeconds => day.pathCount('performance.app_ready.2_to_4s'),
        readyFourToEightSeconds =>
          day.pathCount('performance.app_ready.4_to_8s'),
        readyOverEightSeconds => day.pathCount('performance.app_ready.over_8s'),
      };

  int total(AnalyticsSummary summary) => summary.days.fold(
        0,
        (sum, day) => sum + valueForDay(day),
      );

  int week(AnalyticsSummary summary) => summary.days
      .skip(math.max(0, summary.days.length - 7))
      .fold(0, (sum, day) => sum + valueForDay(day));
}

int _stageErrors(AnalyticsDay day, String stage) {
  const categories = [
    'validation',
    'rate_limit',
    'missing_prerequisite',
    'model_failure',
  ];
  return categories.fold(
    0,
    (sum, category) => sum + day.pathCount('product.$stage.errors.$category'),
  );
}

/// Mergeable, aggregate-only HyperLogLog helpers shared by the dashboard and
/// deterministic tests. The backend stores only these fixed-size registers;
/// it never stores a network address, digest, or per-visitor record.
class UniqueVisitorSketch {
  const UniqueVisitorSketch._();

  /// Must change whenever the backend salt or sketch algorithm changes.
  static const int version = 1;
  static const int registerCount = 256;

  static List<int> normalize(Object? raw) {
    final source = raw is List ? raw : const <Object?>[];
    return List<int>.generate(registerCount, (index) {
      final value = index < source.length ? source[index] : null;
      if (value is! num || !value.isFinite) return 0;
      return value.floor().clamp(0, 64);
    }, growable: false);
  }

  static List<int> merge(Iterable<Object?> sketches) {
    final merged = List<int>.filled(registerCount, 0);
    for (final sketch in sketches) {
      final registers = normalize(sketch);
      for (var index = 0; index < registerCount; index++) {
        if (registers[index] > merged[index]) {
          merged[index] = registers[index];
        }
      }
    }
    return merged;
  }

  static int estimate(Object? raw) {
    final registers = normalize(raw);
    const m = registerCount;
    final alpha = 0.7213 / (1 + 1.079 / m);
    final harmonic = registers.fold<double>(
      0,
      (sum, register) => sum + math.pow(2, -register).toDouble(),
    );
    final rawEstimate = alpha * m * m / harmonic;
    final empty = registers.where((register) => register == 0).length;
    final corrected = rawEstimate <= 2.5 * m && empty > 0
        ? m * math.log(m / empty)
        : rawEstimate;
    return math.max(0, corrected.round());
  }
}

/// Thirty-day analytics view model shared by the production screen and tests.
class AnalyticsSummary {
  const AnalyticsSummary(this.days, {this.topCountries = const []});

  /// Oldest to newest, exactly 30 entries (missing days are zero-filled).
  final List<AnalyticsDay> days;

  /// Rolling-period estimated unique networks per country. This deliberately
  /// never falls back to the legacy `countries` interaction counters.
  final List<MapEntry<String, int>> topCountries;

  factory AnalyticsSummary.fromDocuments(
    Iterable<AnalyticsDocument> documents, {
    Iterable<AnalyticsDocument> countrySketchDocuments = const [],
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
    final includedDays = days.map((day) => day.key).toSet();
    final sketches = <String, List<Object?>>{};
    for (final document in countrySketchDocuments) {
      final data = document.data;
      if (data['type'] != 'country') continue;
      final country = data['key'];
      final day = data['day'];
      if (country is! String ||
          !RegExp(r'^[A-Z]{2}$').hasMatch(country) ||
          day is! String ||
          !includedDays.contains(day) ||
          data['uniqueSketchVersion'] != UniqueVisitorSketch.version ||
          data['uniqueRegisters'] is! List) {
        continue;
      }
      (sketches[country] ??= []).add(data['uniqueRegisters']);
    }
    final uniqueCountries = <MapEntry<String, int>>[
      for (final entry in sketches.entries)
        MapEntry(
          entry.key,
          UniqueVisitorSketch.estimate(
            UniqueVisitorSketch.merge(entry.value),
          ),
        ),
    ]
      ..removeWhere((entry) => entry.value <= 0)
      ..sort((a, b) {
        final byValue = b.value.compareTo(a.value);
        return byValue != 0 ? byValue : a.key.compareTo(b.key);
      });
    return AnalyticsSummary(days,
        topCountries: uniqueCountries.take(10).toList());
  }

  bool get hasRecordedData => days.any((day) => day.wasRecorded);

  AnalyticsDay? day(String key) {
    for (final day in days) {
      if (day.key == key) return day;
    }
    return null;
  }

  /// Return a dashboard-compatible summary where only [key] contributes to
  /// totals. The 30-day shape is retained so existing week helpers stay safe.
  AnalyticsSummary scopedToDay(String? key) {
    if (key == null) return this;
    return AnalyticsSummary([
      for (final day in days)
        AnalyticsDay(
          day.key,
          day.key == key ? day.data : const {},
          wasRecorded: day.key == key && day.wasRecorded,
        ),
    ]);
  }

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

  int pathTotal(String path) =>
      days.fold(0, (total, day) => total + day.pathCount(path));

  int pathWeek(String path) => days
      .skip(days.length - 7)
      .fold(0, (total, day) => total + day.pathCount(path));

  int pathsTotal(Iterable<String> paths) =>
      paths.fold(0, (total, path) => total + pathTotal(path));

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
}
