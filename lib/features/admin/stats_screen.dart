import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:country_flags/country_flags.dart' as country_flags;
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/constants.dart';
import '../../core/theme.dart';
import '../../widgets/app_scaffold.dart';
import 'analytics_summary.dart';

/// Private traffic dashboard, fed by the first-party cookieless counters in
/// `analytics_customer_daily`. Reachable at /#/stats; invisible to normal
/// users and unreadable by them (rules gate reads to the owner account).
class StatsScreen extends StatelessWidget {
  const StatsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    if (kUseMocks) {
      return const AppScaffold(
        title: 'Traffic',
        child: Center(child: Text('Stats are unavailable in demo mode.')),
      );
    }
    return AppScaffold(
      title: 'Traffic',
      maxWidth: 920,
      child: StreamBuilder<User?>(
        stream: FirebaseAuth.instance.authStateChanges(),
        builder: (context, snap) {
          final user = snap.data;
          if (snap.connectionState == ConnectionState.waiting) {
            return Center(
              child: Semantics(
                liveRegion: true,
                label: 'Checking analytics access',
                child:
                    const CircularProgressIndicator(color: AppColors.primary),
              ),
            );
          }
          if (user == null || user.uid != kAdminUid) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(32),
                child: Text('Sign in with the owner account to view stats.'),
              ),
            );
          }
          return const _StatsBody();
        },
      ),
    );
  }
}

class _StatsBody extends StatefulWidget {
  const _StatsBody();

  @override
  State<_StatsBody> createState() => _StatsBodyState();
}

class _StatsBodyState extends State<_StatsBody> {
  late Future<AnalyticsSummary> _future;
  AnalyticsFilter? _selectedFilter;
  Future<AnalyticsSummary>? _filteredFuture;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<AnalyticsSummary> _load() async {
    // Range on the document id (day keys sort lexicographically) — unlike a
    // descending orderBy on __name__, this needs no composite index.
    final today = DateTime.now().toUtc();
    final days = List.generate(
      30,
      (index) => DateFormat('yyyy-MM-dd')
          .format(today.subtract(Duration(days: 29 - index))),
    );
    final cutoff = days.first;
    final dailyFuture = FirebaseFirestore.instance
        .collection('analytics_customer_daily')
        .where(FieldPath.documentId, isGreaterThanOrEqualTo: cutoff)
        .get();
    // Prefix-range reads fetch only country documents (not every path or
    // referrer segment) and require no composite index.
    final segmentCollection = FirebaseFirestore.instance
        .collection('analytics_customer_segment_daily');
    final countryFuture = Future.wait([
      for (final day in days)
        segmentCollection
            .where(
              FieldPath.documentId,
              isGreaterThanOrEqualTo: '${day}__country__',
            )
            .where(
              FieldPath.documentId,
              isLessThanOrEqualTo: '${day}__country__\uf8ff',
            )
            .get(),
    ]);
    final qs = await dailyFuture;
    final countrySnapshots = await countryFuture;
    return AnalyticsSummary.fromDocuments(
      qs.docs.map((doc) => AnalyticsDocument(doc.id, doc.data())),
      countrySketchDocuments: countrySnapshots
          .expand((snapshot) => snapshot.docs)
          .map((doc) => AnalyticsDocument(doc.id, doc.data())),
    );
  }

  Future<AnalyticsSummary> _loadSegment(AnalyticsFilter filter) async {
    final today = DateTime.now().toUtc();
    final days = List.generate(
      30,
      (index) => DateFormat('yyyy-MM-dd')
          .format(today.subtract(Duration(days: 29 - index))),
    );
    final collection = FirebaseFirestore.instance
        .collection('analytics_customer_segment_daily');
    final snapshots = await Future.wait(
      days.map((day) => collection.doc(filter.documentId(day)).get()),
    );
    return AnalyticsSummary.fromDocuments([
      for (var index = 0; index < snapshots.length; index++)
        if (snapshots[index].exists)
          AnalyticsDocument(days[index], snapshots[index].data() ?? const {}),
    ]);
  }

  void _selectFilter(AnalyticsFilter filter) {
    setState(() {
      if (_selectedFilter == filter) {
        _selectedFilter = null;
        _filteredFuture = null;
      } else {
        _selectedFilter = filter;
        _filteredFuture = _loadSegment(filter);
      }
    });
  }

  Future<void> _refresh() async {
    final overall = _load();
    final filtered =
        _selectedFilter == null ? null : _loadSegment(_selectedFilter!);
    setState(() {
      _future = overall;
      _filteredFuture = filtered;
    });
    await overall;
    await filtered;
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<AnalyticsSummary>(
      future: _future,
      builder: (context, snap) {
        if (snap.hasError) {
          return Center(child: Text('Could not load stats: ${snap.error}'));
        }
        if (!snap.hasData) {
          return Center(
            child: Semantics(
              liveRegion: true,
              label: 'Loading traffic statistics',
              child: const CircularProgressIndicator(color: AppColors.primary),
            ),
          );
        }
        final overall = snap.data!;
        return FutureBuilder<AnalyticsSummary>(
          future: _filteredFuture,
          builder: (context, filteredSnap) {
            final filter = _selectedFilter;
            final filtered = filteredSnap.data;
            final segmentData =
                filtered?.hasRecordedData == true ? filtered : null;
            final isLoading = filter != null &&
                filteredSnap.connectionState == ConnectionState.waiting;
            return RefreshIndicator(
              color: AppColors.primary,
              onRefresh: _refresh,
              child: AnalyticsDashboardContent(
                overall: overall,
                filtered: segmentData,
                selectedFilter: filter,
                filterLoading: isLoading,
                filterHasError: filteredSnap.hasError,
                onFilterSelect: _selectFilter,
              ),
            );
          },
        );
      },
    );
  }
}

/// Firebase-free dashboard content so every drill-down interaction can be
/// exercised in widget tests without weakening the owner-only data gate.
class AnalyticsDashboardContent extends StatefulWidget {
  const AnalyticsDashboardContent({
    super.key,
    required this.overall,
    required this.onFilterSelect,
    this.filtered,
    this.selectedFilter,
    this.filterLoading = false,
    this.filterHasError = false,
    this.onMetricChanged,
    this.onDayChanged,
  });

  final AnalyticsSummary overall;
  final AnalyticsSummary? filtered;
  final AnalyticsFilter? selectedFilter;
  final bool filterLoading;
  final bool filterHasError;
  final ValueChanged<AnalyticsFilter> onFilterSelect;
  final ValueChanged<AnalyticsMetric>? onMetricChanged;
  final ValueChanged<String?>? onDayChanged;

  @override
  State<AnalyticsDashboardContent> createState() =>
      _AnalyticsDashboardContentState();
}

class _AnalyticsDashboardContentState extends State<AnalyticsDashboardContent> {
  AnalyticsMetric _metric = AnalyticsMetric.visits;
  String? _dayKey;

  @override
  void didUpdateWidget(covariant AnalyticsDashboardContent oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_dayKey != null && widget.overall.day(_dayKey!) == null) {
      _dayKey = null;
    }
  }

  void _selectMetric(AnalyticsMetric metric) {
    if (_metric == metric) return;
    setState(() => _metric = metric);
    widget.onMetricChanged?.call(metric);
  }

  void _selectDay(String key) {
    final next = _dayKey == key ? null : key;
    setState(() => _dayKey = next);
    widget.onDayChanged?.call(next);
  }

  void _clearMetric() => _selectMetric(AnalyticsMetric.visits);

  void _clearDay() {
    if (_dayKey == null) return;
    setState(() => _dayKey = null);
    widget.onDayChanged?.call(null);
  }

  void _resetView() {
    final filter = widget.selectedFilter;
    final metricChanged = _metric != AnalyticsMetric.visits;
    final dayChanged = _dayKey != null;
    setState(() {
      _metric = AnalyticsMetric.visits;
      _dayKey = null;
    });
    if (metricChanged) {
      widget.onMetricChanged?.call(AnalyticsMetric.visits);
    }
    if (dayChanged) widget.onDayChanged?.call(null);
    if (filter != null) widget.onFilterSelect(filter);
  }

  @override
  Widget build(BuildContext context) {
    final filter = widget.selectedFilter;
    final scopedOverall = widget.overall.scopedToDay(_dayKey);
    final candidateFiltered = widget.filtered?.scopedToDay(_dayKey);
    final scopedFiltered =
        _dayKey != null && candidateFiltered?.hasRecordedData != true
            ? null
            : candidateFiltered;
    final dateLabel = _dayKey == null ? null : _displayDay(_dayKey!);
    final secondaryPeriod =
        _dayKey == null ? 'in last 7 days' : 'in all 30 days';
    final hasLocalFocus = _metric != AnalyticsMetric.visits || _dayKey != null;
    final hasActiveView = filter != null || hasLocalFocus;

    int secondaryValue(AnalyticsMetric metric) => _dayKey == null
        ? metric.week(widget.overall)
        : metric.total(widget.overall);

    int? filteredPrimary(AnalyticsMetric metric) => _filteredMetric(
          scopedOverall,
          scopedFiltered,
          filter,
          metric,
        );

    int? filteredSecondary(AnalyticsMetric metric) => _dayKey == null
        ? _filteredWeek(widget.overall, widget.filtered, filter, metric)
        : _filteredMetric(
            widget.overall,
            widget.filtered,
            filter,
            metric,
          );

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 96, 20, 40),
      children: [
        Text('Last 30 days', style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 4),
        const Text(
          'Customer-only counters — cookieless, aggregate-only. Signed-in '
          'owner activity and private stats routes are excluded; public visits '
          'from a new, unlinked browser cannot be identified as owner traffic. '
          'Legacy totals are not mixed in.',
          style: TextStyle(color: AppColors.textMuted, fontSize: 13),
        ),
        const SizedBox(height: 8),
        const Text(
          'Select any total, graph bar, funnel step, reliability value, timing '
          'row, country, referrer, campaign, or page. Statistics change the '
          'daily series, graph bars filter compatible totals to one UTC day, '
          'and breakdowns compare all traffic with that segment.',
          style: TextStyle(color: AppColors.textMuted, fontSize: 13),
        ),
        const SizedBox(height: 14),
        const _AnalyticsMeaningNotice(),
        if (hasActiveView) ...[
          const SizedBox(height: 14),
          _ActiveViewBanner(
            filter: filter,
            filtered: widget.filtered,
            loading: widget.filterLoading,
            hasError: widget.filterHasError,
            metric: _metric,
            dayKey: _dayKey,
            onClearFilter:
                filter == null ? null : () => widget.onFilterSelect(filter),
            onClearMetric:
                _metric == AnalyticsMetric.visits ? null : _clearMetric,
            onClearDay: _dayKey == null ? null : _clearDay,
            onReset: _resetView,
          ),
        ],
        const SizedBox(height: 20),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            for (final metric in const [
              AnalyticsMetric.visits,
              AnalyticsMetric.pageviews,
              AnalyticsMetric.appOpens,
              AnalyticsMetric.revenue,
              AnalyticsMetric.paid,
              AnalyticsMetric.submittedAppeal,
            ])
              _StatTile(
                metric: metric,
                valuePrimary: metric.total(scopedOverall),
                valueSecondary: secondaryValue(metric),
                filteredPrimary: filteredPrimary(metric),
                filteredSecondary: filteredSecondary(metric),
                filterLabel: filter?.label,
                primaryPeriod: dateLabel ?? '30-day total',
                secondaryPeriod: secondaryPeriod,
                loading:
                    widget.filterLoading && metric.supportsSegmentComparison,
                selected: _metric == metric,
                onTap: () => _selectMetric(metric),
              ),
          ],
        ),
        const SizedBox(height: 28),
        _SectionTitle('Daily ${_metric.label.toLowerCase()}'),
        if (filter != null && !_metric.supportsSegmentComparison)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Text(
              '${_metric.label} is aggregate-only; comparison with '
              '${filter.label} is unavailable.',
              style: const TextStyle(
                color: AppColors.textMuted,
                fontSize: 12,
              ),
            ),
          ),
        _DailyBars(
          days: widget.overall.days,
          metric: _metric,
          filteredDays: _filteredChartDays(
            widget.overall,
            widget.filtered,
            filter,
            _metric,
          ),
          filterLabel: filter != null && _metric.supportsSegmentComparison
              ? filter.label
              : null,
          selectedDayKey: _dayKey,
          onSelectDay: _selectDay,
        ),
        const SizedBox(height: 28),
        _SectionTitle(dateLabel == null
            ? 'Customer journey (30 days)'
            : 'Customer journey ($dateLabel)'),
        const Padding(
          padding: EdgeInsets.only(bottom: 10),
          child: Text(
            'Page traffic is not a case milestone. Paid packages are counted '
            'only after Stripe confirms a completed checkout; submitted '
            'appeals are counted only when a customer records the case as '
            'sent.',
            style: TextStyle(color: AppColors.textMuted, fontSize: 13),
          ),
        ),
        _FunnelCard(
          summary: scopedOverall,
          filterLabel: filter?.label,
          selectedMetric: _metric,
          onSelectMetric: _selectMetric,
        ),
        const SizedBox(height: 28),
        const _SectionTitle('Product reliability and outcomes'),
        const Padding(
          padding: EdgeInsets.only(bottom: 10),
          child: Text(
            'Each workflow transition and final outcome is counted at most '
            'once per case. Error categories are bounded; case text and health '
            'information never enter analytics.',
            style: TextStyle(color: AppColors.textMuted, fontSize: 13),
          ),
        ),
        _ProductHealthCard(
          summary: scopedOverall,
          filterLabel: filter?.label,
          selectedMetric: _metric,
          onSelectMetric: _selectMetric,
        ),
        const SizedBox(height: 28),
        const _SectionTitle('App click-to-ready time'),
        const Padding(
          padding: EdgeInsets.only(bottom: 10),
          child: Text(
            'Measured from opening the secure workspace to its first rendered '
            'frame. Only fixed timing buckets are stored; exact timings and '
            'pages are discarded.',
            style: TextStyle(color: AppColors.textMuted, fontSize: 13),
          ),
        ),
        _AppReadinessCard(
          summary: scopedOverall,
          filterLabel: filter?.label,
          selectedMetric: _metric,
          onSelectMetric: _selectMetric,
        ),
        const SizedBox(height: 28),
        const _SectionTitle('Estimated unique visitors by country'),
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Text(
            'Repeat visits from the same network are deduplicated across the '
            '30-day range. This is an aggregate estimate, not an exact count '
            'of people: shared networks and VPNs can merge or split visitors. '
            'Country estimates stay 30-day overall-only${dateLabel == null ? '' : ' and are not narrowed to $dateLabel'}. '
            'They are not linked to a page, case, submission, or payment.',
            style: const TextStyle(
              color: AppColors.textMuted,
              fontSize: 13,
            ),
          ),
        ),
        AnalyticsBreakdownList(
          dimension: AnalyticsDimension.country,
          entries: widget.overall.topCountries,
          filteredEntries: null,
          selectedFilter: filter,
          labelForKey: (key) => key,
          leadingForKey: (key) => _CountryFlagIcon(key),
          onSelect: widget.onFilterSelect,
          emptyLabel: 'No unique-country estimates recorded yet.',
          compareWithActiveFilter: false,
        ),
        const SizedBox(height: 28),
        _SectionTitle(
            dateLabel == null ? 'Top referrers' : 'Referrers · $dateLabel'),
        AnalyticsBreakdownList(
          dimension: AnalyticsDimension.referrer,
          entries: scopedOverall.topReferrers,
          filteredEntries: scopedFiltered?.topReferrers,
          selectedFilter: filter,
          onSelect: widget.onFilterSelect,
          emptyLabel: 'Direct only so far.',
        ),
        const SizedBox(height: 28),
        _SectionTitle(
            dateLabel == null ? 'Top campaigns' : 'Campaigns · $dateLabel'),
        AnalyticsBreakdownList(
          dimension: AnalyticsDimension.campaign,
          entries: scopedOverall.topCampaigns,
          filteredEntries: scopedFiltered?.topCampaigns,
          selectedFilter: filter,
          onSelect: widget.onFilterSelect,
          emptyLabel: 'No tagged campaign visits yet.',
        ),
        const SizedBox(height: 28),
        _SectionTitle(dateLabel == null
            ? 'Top page routes (pageviews)'
            : 'Page routes (pageviews) · $dateLabel'),
        const Padding(
          padding: EdgeInsets.only(bottom: 10),
          child: Text(
            'These rows count pageviews, not unique visitors or customer '
            'cases. The /appeals route is the public appeals guide index; it '
            'does not mean an appeal was created or submitted.',
            style: TextStyle(color: AppColors.textMuted, fontSize: 13),
          ),
        ),
        AnalyticsBreakdownList(
          dimension: AnalyticsDimension.path,
          entries: scopedOverall.topPaths,
          filteredEntries: scopedFiltered?.topPaths,
          selectedFilter: filter,
          labelForKey: _pageRouteLabel,
          onSelect: widget.onFilterSelect,
          emptyLabel: 'No pageviews yet.',
        ),
      ],
    );
  }

  int? _filteredMetric(
    AnalyticsSummary overall,
    AnalyticsSummary? filtered,
    AnalyticsFilter? filter,
    AnalyticsMetric metric,
  ) {
    if (filter == null || !metric.supportsSegmentComparison) return null;
    if ((metric == AnalyticsMetric.visits ||
            metric == AnalyticsMetric.pageviews) &&
        filter.dimension.primaryMetric == metric.id) {
      return overall.dimensionCount(filter);
    }
    return filtered == null ? null : metric.total(filtered);
  }

  int? _filteredWeek(
    AnalyticsSummary overall,
    AnalyticsSummary? filtered,
    AnalyticsFilter? filter,
    AnalyticsMetric metric,
  ) {
    if (filter == null || !metric.supportsSegmentComparison) return null;
    if ((metric == AnalyticsMetric.visits ||
            metric == AnalyticsMetric.pageviews) &&
        filter.dimension.primaryMetric == metric.id) {
      final mapField = filter.dimension.mapField;
      return overall.days
          .skip(overall.days.length > 7 ? overall.days.length - 7 : 0)
          .fold<int>(0, (total, day) {
        final map = day.data[mapField] as Map<String, dynamic>? ?? const {};
        return total + ((map[filter.key] ?? 0) as num).toInt();
      });
    }
    return filtered == null ? null : metric.week(filtered);
  }

  List<AnalyticsDay>? _filteredChartDays(
    AnalyticsSummary overall,
    AnalyticsSummary? filtered,
    AnalyticsFilter? filter,
    AnalyticsMetric metric,
  ) {
    if (filter == null || !metric.supportsSegmentComparison) return null;
    if ((metric == AnalyticsMetric.visits ||
            metric == AnalyticsMetric.pageviews) &&
        filter.dimension.primaryMetric == metric.id) {
      final mapField = filter.dimension.mapField;
      return [
        for (final day in overall.days)
          AnalyticsDay(
            day.key,
            {
              metric.id: ((day.data[mapField] as Map<String, dynamic>? ??
                          const {})[filter.key] as num?)
                      ?.toInt() ??
                  0,
            },
            wasRecorded: day.wasRecorded,
          ),
      ];
    }
    return filtered?.days;
  }
}

String _displayDay(String key) {
  final parsed = DateTime.tryParse(key);
  return parsed == null ? key : DateFormat('MMM d').format(parsed);
}

class _CountryFlagIcon extends StatelessWidget {
  const _CountryFlagIcon(this.countryCode);

  final String countryCode;

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
        child: country_flags.CountryFlag.fromCountryCode(
          countryCode,
          key: ValueKey('country-flag:$countryCode'),
          theme: const country_flags.ImageTheme(
            width: 24,
            height: 16,
            shape: country_flags.RoundedRectangle(2),
          ),
        ),
      );
}

String _pageRouteLabel(String route) => switch (route) {
      '/appeals' => 'Appeals guide index (/appeals)',
      '/appeals/:article' => 'Appeal guide article (/appeals/:article)',
      _ => route,
    };

class _ActiveViewBanner extends StatelessWidget {
  const _ActiveViewBanner({
    required this.filter,
    required this.filtered,
    required this.loading,
    required this.hasError,
    required this.metric,
    required this.dayKey,
    required this.onClearFilter,
    required this.onClearMetric,
    required this.onClearDay,
    required this.onReset,
  });

  final AnalyticsFilter? filter;
  final AnalyticsSummary? filtered;
  final bool loading;
  final bool hasError;
  final AnalyticsMetric metric;
  final String? dayKey;
  final VoidCallback? onClearFilter;
  final VoidCallback? onClearMetric;
  final VoidCallback? onClearDay;
  final VoidCallback onReset;

  @override
  Widget build(BuildContext context) {
    final firstDay = filtered?.firstRecordedDay;
    final filter = this.filter;
    final viewParts = [
      'Metric: ${metric.label}',
      if (dayKey != null) 'UTC date: $dayKey',
      if (filter != null) 'Segment: ${filter.label}',
    ];
    final detail = filter == null
        ? 'Metric and date focus use aggregate daily counters only.'
        : hasError
            ? 'Segment totals could not be loaded. Clear the segment and try again.'
            : loading
                ? 'Loading segment totals…'
                : !metric.supportsSegmentComparison
                    ? '${metric.label} remains overall-only for ${filter.label}; '
                        'no person-level attribution is stored.'
                    : firstDay == null
                        ? 'Historical ${filter.dimension.singularLabel} totals are '
                            'shown where they already exist. Other combinations '
                            'begin with newly recorded traffic.'
                        : 'Cross-breakdowns include segment records from '
                            '$firstDay. Missing historical days stay unavailable.';
    return Semantics(
      container: true,
      liveRegion: true,
      label: 'Active analytics view: ${viewParts.join(', ')}. $detail',
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.surfaceAlt,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.primary, width: 1.5),
        ),
        child: Wrap(
          spacing: 14,
          runSpacing: 10,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Icon(Icons.tune, color: AppColors.primary, size: 20),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 590),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    viewParts.join(' · '),
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      color: AppColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    detail,
                    style: const TextStyle(
                      color: AppColors.textSecondary,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
            if (onClearMetric != null)
              OutlinedButton.icon(
                key: const ValueKey('analytics-clear-metric'),
                onPressed: onClearMetric,
                icon: const Icon(Icons.show_chart, size: 18),
                label: const Text('Reset metric'),
              ),
            if (onClearDay != null)
              OutlinedButton.icon(
                key: const ValueKey('analytics-clear-day'),
                onPressed: onClearDay,
                icon: const Icon(Icons.calendar_today_outlined, size: 18),
                label: const Text('Clear date'),
              ),
            if (onClearFilter != null)
              OutlinedButton.icon(
                key: const ValueKey('analytics-clear-segment'),
                onPressed: onClearFilter,
                icon: const Icon(Icons.filter_alt_off, size: 18),
                label: const Text('Clear segment'),
              ),
            OutlinedButton.icon(
              key: const ValueKey('analytics-reset-view'),
              onPressed: onReset,
              icon: const Icon(Icons.restart_alt, size: 18),
              label: const Text('Reset all'),
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Semantics(
          header: true,
          child: Text(text, style: Theme.of(context).textTheme.titleMedium),
        ),
      );
}

class _AnalyticsMeaningNotice extends StatelessWidget {
  const _AnalyticsMeaningNotice();

  @override
  Widget build(BuildContext context) {
    const message =
        'Routes and pageviews are not submitted cases. Paid packages and '
        'revenue are anonymous, best-effort analytics totals; Stripe '
        'Transactions is authoritative for an individual purchase. '
        'Unique-country estimates are not linked to page routes, cases, or '
        'payments.';
    return Semantics(
      container: true,
      label: message,
      excludeSemantics: true,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.surfaceAlt,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.border),
        ),
        child: const Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              Icons.info_outline,
              size: 20,
              color: AppColors.textSecondary,
            ),
            SizedBox(width: 10),
            Expanded(
              child: Text(
                message,
                style: TextStyle(
                  color: AppColors.textSecondary,
                  fontSize: 13,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({
    required this.metric,
    required this.valuePrimary,
    required this.valueSecondary,
    required this.filteredPrimary,
    required this.filteredSecondary,
    required this.primaryPeriod,
    required this.secondaryPeriod,
    required this.selected,
    required this.onTap,
    this.filterLabel,
    this.loading = false,
  });

  final AnalyticsMetric metric;
  final int valuePrimary;
  final int valueSecondary;
  final int? filteredPrimary;
  final int? filteredSecondary;
  final String? filterLabel;
  final String primaryPeriod;
  final String secondaryPeriod;
  final bool loading;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final comparisonAvailable = metric.supportsSegmentComparison;
    final filteredPrimaryLabel = loading
        ? '…'
        : comparisonAvailable
            ? _optionalFmt(filteredPrimary)
            : '—';
    final filteredSecondaryLabel = loading
        ? '…'
        : comparisonAvailable
            ? _optionalFmt(filteredSecondary)
            : '—';
    final mainLabel = filterLabel == null
        ? metric.format(valuePrimary)
        : '${metric.format(valuePrimary)} | $filteredPrimaryLabel';
    final secondaryLabel = filterLabel == null
        ? '${metric.format(valueSecondary)} $secondaryPeriod'
        : '${metric.format(valueSecondary)} | $filteredSecondaryLabel '
            '$secondaryPeriod';
    final comparisonDescription = filterLabel == null
        ? ''
        : comparisonAvailable
            ? ', $filteredPrimaryLabel for $filterLabel'
            : '. Segment comparison with $filterLabel is unavailable';
    return SizedBox(
      key: ValueKey('analytics-metric:${metric.id}'),
      width: 210,
      child: Semantics(
        button: true,
        selected: selected,
        onTap: onTap,
        label: '${metric.label}: ${metric.format(valuePrimary)} overall for '
            '$primaryPeriod$comparisonDescription. Activate to show daily '
            '${metric.label.toLowerCase()}.',
        excludeSemantics: true,
        child: Material(
          color: AppColors.surface,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
            side: BorderSide(
              color: selected ? AppColors.primary : AppColors.border,
              width: selected ? 2 : 1,
            ),
          ),
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(14),
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 132),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            metric.label,
                            style: const TextStyle(
                              color: AppColors.textMuted,
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        if (selected)
                          const Icon(
                            Icons.show_chart,
                            size: 18,
                            color: AppColors.primary,
                          ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      mainLabel,
                      softWrap: true,
                      style: const TextStyle(
                        fontFamily: AppFonts.serif,
                        fontSize: 28,
                        fontWeight: FontWeight.w700,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    if (filterLabel != null)
                      Text(
                        comparisonAvailable
                            ? 'All | $filterLabel'
                            : 'All | $filterLabel unavailable',
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: AppColors.primary,
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    Text(
                      secondaryLabel,
                      style: const TextStyle(
                        color: AppColors.textMuted,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  String _optionalFmt(int? value) => value == null ? '—' : metric.format(value);
}

class _DailyBars extends StatefulWidget {
  const _DailyBars({
    required this.days,
    required this.metric,
    required this.selectedDayKey,
    required this.onSelectDay,
    this.filteredDays,
    this.filterLabel,
  });

  final List<AnalyticsDay> days;
  final AnalyticsMetric metric;
  final List<AnalyticsDay>? filteredDays;
  final String? filterLabel;
  final String? selectedDayKey;
  final ValueChanged<String> onSelectDay;

  @override
  State<_DailyBars> createState() => _DailyBarsState();
}

class _DailyBarsState extends State<_DailyBars> {
  late final ScrollController _scrollController;

  @override
  void initState() {
    super.initState();
    _scrollController = ScrollController();
    WidgetsBinding.instance.addPostFrameCallback(_showLatestDays);
  }

  @override
  void didUpdateWidget(covariant _DailyBars oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!identical(oldWidget.days, widget.days)) {
      WidgetsBinding.instance.addPostFrameCallback(_showLatestDays);
    }
  }

  void _showLatestDays(Duration _) {
    if (!mounted || !_scrollController.hasClients) return;
    _scrollController.jumpTo(_scrollController.position.maxScrollExtent);
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final max = widget.days
        .map(widget.metric.valueForDay)
        .fold<int>(0, (a, b) => a > b ? a : b);
    final filteredByDay = {
      for (final day in widget.filteredDays ?? const <AnalyticsDay>[])
        if (day.wasRecorded) day.key: day,
    };
    return Container(
      key: const ValueKey('analytics-daily-chart'),
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (max == 0)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text(
                'No ${widget.metric.label.toLowerCase()} recorded yet. Select a day '
                'to inspect its other totals.',
                style: const TextStyle(
                  color: AppColors.textMuted,
                  fontSize: 12,
                ),
              ),
            ),
          SizedBox(
            height: 156,
            child: LayoutBuilder(
              builder: (context, constraints) {
                // WCAG 2.2's 24 CSS-pixel target minimum lets all 30 days fit
                // in the desktop dashboard. Narrow screens keep a visible,
                // horizontal scroll affordance rather than shrinking targets.
                final minimumWidth = widget.days.length * 24.0;
                final needsHorizontalScroll =
                    constraints.maxWidth < minimumWidth;
                final chartWidth =
                    needsHorizontalScroll ? minimumWidth : constraints.maxWidth;
                final itemWidth = widget.days.isEmpty
                    ? 24.0
                    : chartWidth / widget.days.length;
                final scrollView = ScrollConfiguration(
                  behavior: ScrollConfiguration.of(context).copyWith(
                    scrollbars: false,
                  ),
                  child: SingleChildScrollView(
                    controller: _scrollController,
                    scrollDirection: Axis.horizontal,
                    child: SizedBox(
                      width: chartWidth,
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          for (final day in widget.days)
                            SizedBox(
                              width: itemWidth,
                              child: _DailyBar(
                                day: day,
                                metric: widget.metric,
                                filteredDay: filteredByDay[day.key],
                                max: max,
                                filterLabel: widget.filterLabel,
                                selected: widget.selectedDayKey == day.key,
                                onTap: () => widget.onSelectDay(day.key),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                );
                if (!needsHorizontalScroll) return scrollView;
                return Scrollbar(
                  controller: _scrollController,
                  thumbVisibility: true,
                  trackVisibility: true,
                  interactive: true,
                  child: scrollView,
                );
              },
            ),
          ),
          if (widget.filterLabel != null) ...[
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const _LegendSwatch(
                  color: AppColors.accent,
                  label: 'All traffic',
                ),
                const SizedBox(width: 14),
                _LegendSwatch(
                  color: AppColors.primary,
                  label: widget.filterLabel!,
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _DailyBar extends StatelessWidget {
  const _DailyBar({
    required this.day,
    required this.metric,
    required this.filteredDay,
    required this.max,
    required this.filterLabel,
    required this.selected,
    required this.onTap,
  });

  final AnalyticsDay day;
  final AnalyticsMetric metric;
  final AnalyticsDay? filteredDay;
  final int max;
  final String? filterLabel;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final total = metric.valueForDay(day);
    final filtered =
        filteredDay == null ? null : metric.valueForDay(filteredDay!);
    final totalHeight = max == 0 ? 3.0 : 4 + 86 * total / max;
    final filteredHeight = filtered == null || max == 0
        ? 0.0
        : 4 + 86 * filtered.clamp(0, total) / max;
    final filteredLabel =
        filtered == null ? 'not recorded' : metric.format(filtered);
    final message = filterLabel == null
        ? '${day.key}: ${metric.format(total)} ${metric.label.toLowerCase()}'
        : '${day.key}: ${metric.format(total)} overall, $filteredLabel for '
            '$filterLabel';
    return SizedBox(
      key: ValueKey('analytics-day:${day.key}'),
      child: Semantics(
        button: true,
        selected: selected,
        onTap: onTap,
        label: '$message. Activate to ${selected ? 'clear' : 'select'} this '
            'UTC date.',
        excludeSemantics: true,
        child: Tooltip(
          message: message,
          child: Material(
            color: selected
                ? AppColors.primary.withValues(alpha: 0.08)
                : Colors.transparent,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
              side: BorderSide(
                color: selected ? AppColors.primary : Colors.transparent,
                width: 2,
              ),
            ),
            child: InkWell(
              onTap: onTap,
              borderRadius: BorderRadius.circular(8),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(3, 4, 3, 2),
                child: Column(
                  children: [
                    Expanded(
                      child: Stack(
                        alignment: Alignment.bottomCenter,
                        children: [
                          Container(
                            margin: const EdgeInsets.symmetric(horizontal: 2),
                            height: totalHeight,
                            decoration: BoxDecoration(
                              color: total == 0
                                  ? AppColors.surfaceAlt
                                  : AppColors.accent,
                              borderRadius: const BorderRadius.vertical(
                                top: Radius.circular(3),
                              ),
                            ),
                          ),
                          if (filteredHeight > 0)
                            FractionallySizedBox(
                              widthFactor: .56,
                              child: Container(
                                height: filteredHeight,
                                decoration: const BoxDecoration(
                                  color: AppColors.primary,
                                  borderRadius: BorderRadius.vertical(
                                    top: Radius.circular(3),
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      day.key.length >= 10 ? day.key.substring(8) : day.key,
                      style: TextStyle(
                        color:
                            selected ? AppColors.primary : AppColors.textMuted,
                        fontSize: 10,
                        fontWeight:
                            selected ? FontWeight.w800 : FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _LegendSwatch extends StatelessWidget {
  const _LegendSwatch({required this.color, required this.label});

  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) => Flexible(
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 12,
              height: 12,
              decoration: BoxDecoration(
                color: color,
                borderRadius: BorderRadius.circular(3),
              ),
            ),
            const SizedBox(width: 5),
            Flexible(
              child: Text(
                label,
                overflow: TextOverflow.ellipsis,
                style:
                    const TextStyle(color: AppColors.textMuted, fontSize: 11),
              ),
            ),
          ],
        ),
      );
}

class _FunnelCard extends StatelessWidget {
  const _FunnelCard({
    required this.summary,
    required this.selectedMetric,
    required this.onSelectMetric,
    this.filterLabel,
  });

  final AnalyticsSummary summary;
  final String? filterLabel;
  final AnalyticsMetric selectedMetric;
  final ValueChanged<AnalyticsMetric> onSelectMetric;

  @override
  Widget build(BuildContext context) {
    const steps = <(String, AnalyticsMetric)>[
      ('Visits', AnalyticsMetric.visits),
      ('Opened app', AnalyticsMetric.appOpens),
      ('Uploaded denial', AnalyticsMetric.uploadedDenial),
      ('Extracted facts', AnalyticsMetric.extractedFacts),
      ('Saw preview', AnalyticsMetric.sawPreview),
      ('Started checkout', AnalyticsMetric.startedCheckout),
      ('Paid package', AnalyticsMetric.paid),
      ('Packet ready', AnalyticsMetric.packetReady),
      ('Submitted appeal', AnalyticsMetric.submittedAppeal),
    ];
    final values = [for (final step in steps) step.$2.total(summary)];
    final top = values.first;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        children: [
          for (var i = 0; i < steps.length; i++) ...[
            if (i > 0) const SizedBox(height: 10),
            _FunnelRow(
              label: steps[i].$1,
              metric: steps[i].$2,
              value: values[i],
              filterLabel: filterLabel,
              fraction: top == 0 ? 0 : values[i] / top,
              conversion: i == 0 || values[i - 1] == 0
                  ? null
                  : values[i] / values[i - 1],
              selected: selectedMetric == steps[i].$2,
              onTap: () => onSelectMetric(steps[i].$2),
            ),
          ],
        ],
      ),
    );
  }
}

class _ProductHealthCard extends StatelessWidget {
  const _ProductHealthCard({
    required this.summary,
    required this.selectedMetric,
    required this.onSelectMetric,
    this.filterLabel,
  });

  final AnalyticsSummary summary;
  final AnalyticsMetric selectedMetric;
  final ValueChanged<AnalyticsMetric> onSelectMetric;
  final String? filterLabel;

  @override
  Widget build(BuildContext context) {
    const stages =
        <(String, AnalyticsMetric, AnalyticsMetric, AnalyticsMetric)>[
      (
        'Extraction',
        AnalyticsMetric.extractionStarted,
        AnalyticsMetric.extractedFacts,
        AnalyticsMetric.extractionErrors,
      ),
      (
        'Preview',
        AnalyticsMetric.previewStarted,
        AnalyticsMetric.previewCompleted,
        AnalyticsMetric.previewErrors,
      ),
      (
        'Packet',
        AnalyticsMetric.packetStarted,
        AnalyticsMetric.packetReady,
        AnalyticsMetric.packetErrors,
      ),
    ];
    const outcomes = <(String, AnalyticsMetric)>[
      ('Approved', AnalyticsMetric.outcomeApproved),
      ('Partially approved', AnalyticsMetric.outcomePartiallyApproved),
      ('Denied', AnalyticsMetric.outcomeDenied),
      ('Withdrawn', AnalyticsMetric.outcomeWithdrawn),
    ];
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (filterLabel != null) ...[
            Text(
              'Overall only | — for $filterLabel. Workflow and outcome '
              'events are not attributed to traffic segments.',
              style: const TextStyle(
                color: AppColors.textMuted,
                fontSize: 12,
              ),
            ),
            const SizedBox(height: 12),
          ],
          for (var index = 0; index < stages.length; index++) ...[
            if (index > 0) const Divider(height: 24),
            Wrap(
              spacing: 10,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                SizedBox(
                  width: 112,
                  child: Text(
                    stages[index].$1,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
                _MiniMetric(
                  label: 'Started',
                  metric: stages[index].$2,
                  value: stages[index].$2.total(summary),
                  selected: selectedMetric == stages[index].$2,
                  onTap: () => onSelectMetric(stages[index].$2),
                  filterLabel: filterLabel,
                ),
                _MiniMetric(
                  label: 'Completed',
                  metric: stages[index].$3,
                  value: stages[index].$3.total(summary),
                  selected: selectedMetric == stages[index].$3,
                  onTap: () => onSelectMetric(stages[index].$3),
                  filterLabel: filterLabel,
                ),
                _MiniMetric(
                  label: 'Errors',
                  metric: stages[index].$4,
                  value: stages[index].$4.total(summary),
                  selected: selectedMetric == stages[index].$4,
                  onTap: () => onSelectMetric(stages[index].$4),
                  filterLabel: filterLabel,
                ),
              ],
            ),
          ],
          const Divider(height: 28),
          const Text('Recorded final outcomes',
              style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 10),
          Wrap(
            spacing: 18,
            runSpacing: 10,
            children: [
              for (final outcome in outcomes)
                _MiniMetric(
                  label: outcome.$1,
                  metric: outcome.$2,
                  value: outcome.$2.total(summary),
                  selected: selectedMetric == outcome.$2,
                  onTap: () => onSelectMetric(outcome.$2),
                  filterLabel: filterLabel,
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MiniMetric extends StatelessWidget {
  const _MiniMetric({
    required this.label,
    required this.metric,
    required this.value,
    required this.selected,
    required this.onTap,
    this.filterLabel,
  });

  final String label;
  final AnalyticsMetric metric;
  final int value;
  final bool selected;
  final VoidCallback onTap;
  final String? filterLabel;

  @override
  Widget build(BuildContext context) => SizedBox(
        key: ValueKey('analytics-product:${metric.id}'),
        child: Semantics(
          button: true,
          selected: selected,
          onTap: onTap,
          label: '${metric.label}: ${metric.format(value)} overall.'
              '${filterLabel == null ? '' : ' Segment comparison with $filterLabel is unavailable.'} '
              'Activate to show its daily totals.',
          excludeSemantics: true,
          child: Material(
            color: selected
                ? AppColors.primary.withValues(alpha: 0.08)
                : Colors.transparent,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(9),
              side: BorderSide(
                color: selected ? AppColors.primary : AppColors.border,
                width: selected ? 2 : 1,
              ),
            ),
            child: InkWell(
              onTap: onTap,
              borderRadius: BorderRadius.circular(9),
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 48),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 10,
                  ),
                  child: Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Text(
                        '$label ${metric.format(value)}',
                        style: TextStyle(
                          color: selected
                              ? AppColors.primary
                              : AppColors.textSecondary,
                          fontWeight:
                              selected ? FontWeight.w700 : FontWeight.w400,
                        ),
                      ),
                      if (selected)
                        const Icon(
                          Icons.show_chart,
                          color: AppColors.primary,
                          size: 17,
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      );
}

class _AppReadinessCard extends StatelessWidget {
  const _AppReadinessCard({
    required this.summary,
    required this.selectedMetric,
    required this.onSelectMetric,
    this.filterLabel,
  });

  final AnalyticsSummary summary;
  final AnalyticsMetric selectedMetric;
  final ValueChanged<AnalyticsMetric> onSelectMetric;
  final String? filterLabel;

  @override
  Widget build(BuildContext context) {
    const buckets = <(String, AnalyticsMetric)>[
      ('Under 1 second', AnalyticsMetric.readyUnderOneSecond),
      ('1–2 seconds', AnalyticsMetric.readyOneToTwoSeconds),
      ('2–4 seconds', AnalyticsMetric.readyTwoToFourSeconds),
      ('4–8 seconds', AnalyticsMetric.readyFourToEightSeconds),
      ('Over 8 seconds', AnalyticsMetric.readyOverEightSeconds),
    ];
    final values = [for (final bucket in buckets) bucket.$2.total(summary)];
    final total = values.fold(0, (runningTotal, value) => runningTotal + value);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (filterLabel != null) ...[
            Text(
              'Overall only | — for $filterLabel. Readiness buckets are not '
              'attributed to traffic segments.',
              style: const TextStyle(
                color: AppColors.textMuted,
                fontSize: 12,
              ),
            ),
            const SizedBox(height: 12),
          ],
          if (total == 0) ...[
            const Text(
              'No app-ready measurements recorded yet.',
              style: TextStyle(color: AppColors.textMuted),
            ),
            const SizedBox(height: 8),
          ],
          for (var index = 0; index < buckets.length; index++) ...[
            if (index > 0) const SizedBox(height: 8),
            _TimingBucket(
              label: buckets[index].$1,
              metric: buckets[index].$2,
              value: values[index],
              total: total,
              selected: selectedMetric == buckets[index].$2,
              onTap: () => onSelectMetric(buckets[index].$2),
              filterLabel: filterLabel,
            ),
          ],
        ],
      ),
    );
  }
}

class _TimingBucket extends StatelessWidget {
  const _TimingBucket({
    required this.label,
    required this.metric,
    required this.value,
    required this.total,
    required this.selected,
    required this.onTap,
    this.filterLabel,
  });

  final String label;
  final AnalyticsMetric metric;
  final int value;
  final int total;
  final bool selected;
  final VoidCallback onTap;
  final String? filterLabel;

  @override
  Widget build(BuildContext context) {
    final fraction = total == 0 ? 0.0 : value / total;
    final percent = (fraction * 100).toStringAsFixed(1);
    return SizedBox(
      key: ValueKey('analytics-ready:${metric.id}'),
      child: Semantics(
        button: true,
        selected: selected,
        onTap: onTap,
        label: '$label: $value app opens, $percent percent overall.'
            '${filterLabel == null ? '' : ' Segment comparison with $filterLabel is unavailable.'} '
            'Activate to show its daily totals.',
        excludeSemantics: true,
        child: Material(
          color: selected
              ? AppColors.primary.withValues(alpha: 0.08)
              : Colors.transparent,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(9),
            side: BorderSide(
              color: selected ? AppColors.primary : Colors.transparent,
              width: 2,
            ),
          ),
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(9),
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 56),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 8,
                ),
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    final scaledFont =
                        MediaQuery.textScalerOf(context).scale(13);
                    final compact =
                        constraints.maxWidth < 360 || scaledFont > 17;
                    final valueText = Text(
                      '$value · $percent%${selected ? ' · selected' : ''}',
                      style: TextStyle(
                        color: selected
                            ? AppColors.primary
                            : AppColors.textSecondary,
                        fontWeight:
                            selected ? FontWeight.w700 : FontWeight.w400,
                      ),
                    );
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (compact) ...[
                          Text(
                            label,
                            style: TextStyle(
                              fontWeight:
                                  selected ? FontWeight.w700 : FontWeight.w400,
                            ),
                          ),
                          valueText,
                        ] else
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  label,
                                  style: TextStyle(
                                    fontWeight: selected
                                        ? FontWeight.w700
                                        : FontWeight.w400,
                                  ),
                                ),
                              ),
                              valueText,
                            ],
                          ),
                        const SizedBox(height: 5),
                        LinearProgressIndicator(
                          value: fraction.clamp(0, 1),
                          minHeight: 10,
                          backgroundColor: AppColors.surfaceAlt,
                          color:
                              selected ? AppColors.primary : AppColors.accent,
                        ),
                      ],
                    );
                  },
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _FunnelRow extends StatelessWidget {
  const _FunnelRow({
    required this.label,
    required this.metric,
    required this.value,
    required this.fraction,
    required this.selected,
    required this.onTap,
    this.filterLabel,
    this.conversion,
  });

  final String label;
  final AnalyticsMetric metric;
  final int value;
  final double fraction;
  final String? filterLabel;
  final bool selected;
  final VoidCallback onTap;

  /// Conversion from the previous step, null for the first row.
  final double? conversion;

  @override
  Widget build(BuildContext context) {
    final overallLabel = conversion == null
        ? '$value'
        : '$value (${(conversion! * 100).toStringAsFixed(1)}% conversion)';
    final canCompare = filterLabel != null && metric.supportsSegmentComparison;
    final valueLabel = filterLabel == null
        ? overallLabel
        : canCompare
            ? '$overallLabel | graph'
            : '$overallLabel | —';
    Widget bar() => ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: LinearProgressIndicator(
            value: fraction.clamp(0, 1),
            minHeight: 14,
            backgroundColor: AppColors.surfaceAlt,
            color: selected ? AppColors.primary : AppColors.accent,
          ),
        );
    final segmentDescription = filterLabel == null
        ? ''
        : canCompare
            ? ' The chart can compare it with $filterLabel.'
            : ' Segment attribution is unavailable for $filterLabel.';
    return SizedBox(
      key: ValueKey('analytics-funnel:${metric.id}'),
      child: Semantics(
        button: true,
        selected: selected,
        onTap: onTap,
        label: '$label: $overallLabel overall.$segmentDescription Activate '
            'to show its daily totals.',
        excludeSemantics: true,
        child: Material(
          color: selected
              ? AppColors.primary.withValues(alpha: 0.08)
              : Colors.transparent,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(9),
            side: BorderSide(
              color: selected ? AppColors.primary : Colors.transparent,
              width: 2,
            ),
          ),
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(9),
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 48),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 8,
                ),
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    final scaledFont =
                        MediaQuery.textScalerOf(context).scale(13);
                    if (constraints.maxWidth < 430 || scaledFont > 17) {
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  label,
                                  style: const TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                              if (selected)
                                const Icon(
                                  Icons.show_chart,
                                  color: AppColors.primary,
                                  size: 17,
                                ),
                            ],
                          ),
                          const SizedBox(height: 2),
                          Text(
                            valueLabel,
                            style: const TextStyle(
                              fontSize: 13,
                              color: AppColors.textSecondary,
                            ),
                          ),
                          const SizedBox(height: 6),
                          bar(),
                        ],
                      );
                    }
                    return Row(
                      children: [
                        SizedBox(
                          width: 150,
                          child: Text(
                            label,
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        Expanded(child: bar()),
                        SizedBox(
                          width: 120,
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.end,
                            children: [
                              Flexible(
                                child: Text(
                                  valueLabel,
                                  textAlign: TextAlign.right,
                                  style: const TextStyle(
                                    fontSize: 13,
                                    color: AppColors.textSecondary,
                                  ),
                                ),
                              ),
                              if (selected) ...[
                                const SizedBox(width: 4),
                                const Icon(
                                  Icons.show_chart,
                                  color: AppColors.primary,
                                  size: 17,
                                ),
                              ],
                            ],
                          ),
                        ),
                      ],
                    );
                  },
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Accessible, selectable breakdown list used by the private stats dashboard.
/// Public so its filter behavior can be covered without Firebase in tests.
class AnalyticsBreakdownList extends StatelessWidget {
  const AnalyticsBreakdownList({
    super.key,
    required this.dimension,
    required this.entries,
    required this.filteredEntries,
    required this.selectedFilter,
    required this.onSelect,
    required this.emptyLabel,
    this.labelForKey,
    this.leadingForKey,
    this.compareWithActiveFilter = true,
  });

  final AnalyticsDimension dimension;
  final List<MapEntry<String, int>> entries;
  final List<MapEntry<String, int>>? filteredEntries;
  final AnalyticsFilter? selectedFilter;
  final ValueChanged<AnalyticsFilter> onSelect;
  final String emptyLabel;
  final String Function(String key)? labelForKey;
  final Widget Function(String key)? leadingForKey;
  final bool compareWithActiveFilter;

  @override
  Widget build(BuildContext context) {
    final overall = {for (final entry in entries) entry.key: entry.value};
    final filtered = {
      for (final entry in filteredEntries ?? const <MapEntry<String, int>>[])
        entry.key: entry.value,
    };
    final keys = <String>[...overall.keys];
    for (final key in filtered.keys) {
      if (!keys.contains(key)) keys.add(key);
    }
    final selected = selectedFilter;
    final comparisonUnit =
        dimension.primaryMetric == 'pageviews' ? 'pageviews' : 'visits';
    if (selected?.dimension == dimension && !keys.contains(selected!.key)) {
      keys.add(selected.key);
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: keys.isEmpty
          ? Padding(
              padding: const EdgeInsets.all(16),
              child: Text(emptyLabel,
                  style: const TextStyle(color: AppColors.textMuted)),
            )
          : Column(
              children: [
                if (selected != null && compareWithActiveFilter)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(8, 4, 8, 6),
                    child: Align(
                      alignment: Alignment.centerRight,
                      child: Text(
                        'All $comparisonUnit | ${selected.label} '
                        '$comparisonUnit',
                        style: const TextStyle(
                          color: AppColors.primary,
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                for (final key in keys)
                  _TopListRow(
                    key: ValueKey('${dimension.storageName}:$key'),
                    label: labelForKey?.call(key) ?? key,
                    leading: leadingForKey?.call(key),
                    overall: overall[key] ?? 0,
                    filtered: compareWithActiveFilter
                        ? _filteredValue(
                            key,
                            overall: overall,
                            filtered: filtered,
                            filteredLoaded: filteredEntries != null,
                          )
                        : null,
                    selected: selected?.dimension == dimension &&
                        selected?.key == key,
                    filterActive: selected != null && compareWithActiveFilter,
                    onTap: () => onSelect(AnalyticsFilter(
                      dimension: dimension,
                      key: key,
                      label: labelForKey?.call(key) ?? key,
                    )),
                  ),
              ],
            ),
    );
  }

  int? _filteredValue(
    String key, {
    required Map<String, int> overall,
    required Map<String, int> filtered,
    required bool filteredLoaded,
  }) {
    if (selectedFilter == null) return null;
    if (selectedFilter?.dimension == dimension && selectedFilter?.key == key) {
      // The original aggregate map is an exact historical total for its own
      // selected dimension, including dates before segment records existed.
      return overall[key] ?? 0;
    }
    if (!filteredLoaded) return null;
    return filtered[key] ?? 0;
  }
}

class _TopListRow extends StatelessWidget {
  const _TopListRow({
    super.key,
    required this.label,
    required this.leading,
    required this.overall,
    required this.filtered,
    required this.selected,
    required this.filterActive,
    required this.onTap,
  });

  final String label;
  final Widget? leading;
  final int overall;
  final int? filtered;
  final bool selected;
  final bool filterActive;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final valueLabel = selected && filterActive
        ? '$overall · Selected'
        : filterActive
            ? '$overall | ${filtered ?? '—'}'
            : '$overall';
    final icon = Icon(
      selected ? Icons.filter_alt : Icons.filter_alt_outlined,
      size: 18,
      color: selected ? AppColors.primary : AppColors.textMuted,
    );
    final labelText = Text(
      label,
      overflow: TextOverflow.ellipsis,
      style: TextStyle(
        fontFamily: AppFonts.mono,
        fontSize: 13,
        fontWeight: selected ? FontWeight.w700 : FontWeight.w400,
      ),
    );
    final valueText = Text(
      valueLabel,
      textAlign: TextAlign.right,
      style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
    );
    return Semantics(
      button: true,
      selected: selected,
      onTap: onTap,
      label: selected && filterActive
          ? '$label, $overall overall, selected filter. Activate to clear this '
              'filter.'
          : filterActive
              ? '$label, $overall overall, ${filtered ?? 'not available'} filtered'
              : '$label, $overall. Activate to filter every statistic.',
      excludeSemantics: true,
      child: Material(
        color: selected ? AppColors.surfaceAlt : Colors.transparent,
        borderRadius: BorderRadius.circular(9),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(9),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 48),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final compact = constraints.maxWidth < 360 ||
                      MediaQuery.textScalerOf(context).scale(13) > 17;
                  if (compact) {
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          children: [
                            icon,
                            const SizedBox(width: 8),
                            if (leading != null) ...[
                              leading!,
                              const SizedBox(width: 8),
                            ],
                            Expanded(child: labelText),
                          ],
                        ),
                        const SizedBox(height: 3),
                        Padding(
                          padding: const EdgeInsets.only(left: 26),
                          child: valueText,
                        ),
                      ],
                    );
                  }
                  return Row(
                    children: [
                      icon,
                      const SizedBox(width: 8),
                      if (leading != null) ...[
                        leading!,
                        const SizedBox(width: 8),
                      ],
                      Expanded(child: labelText),
                      const SizedBox(width: 12),
                      valueText,
                    ],
                  );
                },
              ),
            ),
          ),
        ),
      ),
    );
  }
}
