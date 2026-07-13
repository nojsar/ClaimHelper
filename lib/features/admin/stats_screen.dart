import 'package:cloud_firestore/cloud_firestore.dart';
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
    final cutoff = DateFormat('yyyy-MM-dd')
        .format(DateTime.now().toUtc().subtract(const Duration(days: 29)));
    final qs = await FirebaseFirestore.instance
        .collection('analytics_customer_daily')
        .where(FieldPath.documentId, isGreaterThanOrEqualTo: cutoff)
        .get();
    return AnalyticsSummary.fromDocuments(
      qs.docs.map((doc) => AnalyticsDocument(doc.id, doc.data())),
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
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 96, 20, 40),
                children: [
                  Text('Last 30 days',
                      style: Theme.of(context).textTheme.headlineSmall),
                  const SizedBox(height: 4),
                  const Text(
                    'Customer-only counters — cookieless, aggregate-only. '
                    'Owner activity is excluded; legacy totals are not mixed '
                    'in.',
                    style: TextStyle(color: AppColors.textMuted, fontSize: 13),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Select any country, referrer, campaign, or page to '
                    'compare all traffic with that segment.',
                    style: TextStyle(color: AppColors.textMuted, fontSize: 13),
                  ),
                  if (filter != null) ...[
                    const SizedBox(height: 14),
                    _ActiveFilterBanner(
                      filter: filter,
                      filtered: filtered,
                      loading: isLoading,
                      hasError: filteredSnap.hasError,
                      onClear: () => _selectFilter(filter),
                    ),
                  ],
                  const SizedBox(height: 20),
                  Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    children: [
                      _StatTile(
                        'Visits',
                        overall.total('visits'),
                        overall.week('visits'),
                        filtered30: _filteredMetric(
                            overall, segmentData, filter, 'visits'),
                        filtered7: _filteredWeek(
                            overall, segmentData, filter, 'visits'),
                        filterLabel: filter?.label,
                        loading: isLoading,
                      ),
                      _StatTile(
                        'Pageviews',
                        overall.total('pageviews'),
                        overall.week('pageviews'),
                        filtered30: _filteredMetric(
                            overall, segmentData, filter, 'pageviews'),
                        filtered7: _filteredWeek(
                            overall, segmentData, filter, 'pageviews'),
                        filterLabel: filter?.label,
                        loading: isLoading,
                      ),
                      _StatTile(
                        'App opens',
                        overall.total('boots'),
                        overall.week('boots'),
                        filtered30: segmentData?.total('boots'),
                        filtered7: segmentData?.week('boots'),
                        filterLabel: filter?.label,
                        loading: isLoading,
                      ),
                      _StatTile.money(
                        'Revenue',
                        overall.totalRevenueCents,
                        overall.weekRevenueCents,
                        filterLabel: filter?.label,
                        loading: isLoading,
                      ),
                    ],
                  ),
                  const SizedBox(height: 28),
                  const _SectionTitle('Daily visits'),
                  _DailyBars(
                    days: overall.days,
                    filteredDays: filter == null ? null : segmentData?.days,
                    filterLabel: filter?.label,
                  ),
                  const SizedBox(height: 28),
                  const _SectionTitle('Funnel (30 days)'),
                  _FunnelCard(
                    summary: overall,
                    filterLabel: filter?.label,
                  ),
                  const SizedBox(height: 28),
                  const _SectionTitle('Top countries'),
                  AnalyticsBreakdownList(
                    dimension: AnalyticsDimension.country,
                    entries: overall.topCountries,
                    filteredEntries: segmentData?.topCountries,
                    selectedFilter: filter,
                    labelForKey: (key) => '${_flag(key)} $key',
                    onSelect: _selectFilter,
                    emptyLabel: 'No visits with a resolved country yet.',
                  ),
                  const SizedBox(height: 28),
                  const _SectionTitle('Top referrers'),
                  AnalyticsBreakdownList(
                    dimension: AnalyticsDimension.referrer,
                    entries: overall.topReferrers,
                    filteredEntries: segmentData?.topReferrers,
                    selectedFilter: filter,
                    onSelect: _selectFilter,
                    emptyLabel: 'Direct only so far.',
                  ),
                  const SizedBox(height: 28),
                  const _SectionTitle('Top campaigns'),
                  AnalyticsBreakdownList(
                    dimension: AnalyticsDimension.campaign,
                    entries: overall.topCampaigns,
                    filteredEntries: segmentData?.topCampaigns,
                    selectedFilter: filter,
                    onSelect: _selectFilter,
                    emptyLabel: 'No tagged campaign visits yet.',
                  ),
                  const SizedBox(height: 28),
                  const _SectionTitle('Top pages'),
                  AnalyticsBreakdownList(
                    dimension: AnalyticsDimension.path,
                    entries: overall.topPaths,
                    filteredEntries: segmentData?.topPaths,
                    selectedFilter: filter,
                    onSelect: _selectFilter,
                    emptyLabel: 'No pageviews yet.',
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  int? _filteredMetric(
    AnalyticsSummary overall,
    AnalyticsSummary? filtered,
    AnalyticsFilter? filter,
    String field,
  ) {
    if (filter == null) return null;
    if (filter.dimension.primaryMetric == field) {
      return overall.dimensionCount(filter);
    }
    return filtered?.total(field);
  }

  int? _filteredWeek(
    AnalyticsSummary overall,
    AnalyticsSummary? filtered,
    AnalyticsFilter? filter,
    String field,
  ) {
    if (filter == null) return null;
    if (filter.dimension.primaryMetric == field) {
      final mapField = filter.dimension.mapField;
      return overall.days.skip(overall.days.length - 7).fold<int>(0,
          (total, day) {
        final map = day.data[mapField] as Map<String, dynamic>? ?? const {};
        return total + ((map[filter.key] ?? 0) as num).toInt();
      });
    }
    return filtered?.week(field);
  }
}

/// ISO 3166-1 alpha-2 code → flag emoji (regional indicator pair). Windows
/// has no flag glyphs and falls back to plain letters — harmless.
String _flag(String cc) => cc.length == 2
    ? String.fromCharCodes(cc.codeUnits.map((c) => 0x1F1E6 + (c - 0x41)))
    : '';

class _ActiveFilterBanner extends StatelessWidget {
  const _ActiveFilterBanner({
    required this.filter,
    required this.filtered,
    required this.loading,
    required this.hasError,
    required this.onClear,
  });

  final AnalyticsFilter filter;
  final AnalyticsSummary? filtered;
  final bool loading;
  final bool hasError;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final firstDay = filtered?.firstRecordedDay;
    final detail = hasError
        ? 'Filtered totals could not be loaded. Clear the filter and try again.'
        : loading
            ? 'Loading filtered totals…'
            : firstDay == null
                ? 'Historical ${filter.dimension.singularLabel} totals are shown '
                    'where they already exist. Other combinations begin with new '
                    'traffic after this feature is deployed.'
                : 'Cross-breakdowns include segment records from $firstDay. '
                    'Funnel and revenue stay overall-only so no person-level '
                    'attribution is stored.';
    return Semantics(
      container: true,
      liveRegion: true,
      label: 'Active filter: ${filter.label}. $detail',
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
            Icon(Icons.filter_alt, color: AppColors.primary, size: 20),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 590),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'All traffic | ${filter.label}',
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
            OutlinedButton.icon(
              onPressed: onClear,
              icon: const Icon(Icons.close, size: 18),
              label: const Text('Clear filter'),
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
        child: Text(text, style: Theme.of(context).textTheme.titleMedium),
      );
}

class _StatTile extends StatelessWidget {
  const _StatTile(
    this.label,
    this.value30,
    this.value7, {
    this.filtered30,
    this.filtered7,
    this.filterLabel,
    this.loading = false,
  }) : money = false;

  const _StatTile.money(
    this.label,
    this.value30,
    this.value7, {
    this.filterLabel,
    this.loading = false,
  })  : money = true,
        filtered30 = null,
        filtered7 = null;

  final String label;
  final int value30;
  final int value7;
  final bool money;
  final int? filtered30;
  final int? filtered7;
  final String? filterLabel;
  final bool loading;

  String _fmt(int v) => money
      ? '\$${(v / 100).toStringAsFixed(2)}'
      : NumberFormat.decimalPattern().format(v);

  @override
  Widget build(BuildContext context) {
    final filtered30Label = loading ? '…' : _optionalFmt(filtered30);
    final filtered7Label = loading ? '…' : _optionalFmt(filtered7);
    final mainLabel = filterLabel == null
        ? _fmt(value30)
        : '${_fmt(value30)} | $filtered30Label';
    final weekLabel = filterLabel == null
        ? '${_fmt(value7)} in last 7 days'
        : '${_fmt(value7)} | $filtered7Label in last 7 days';
    return Container(
      width: 210,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: const TextStyle(
                  color: AppColors.textMuted,
                  fontSize: 13,
                  fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          Semantics(
            label: filterLabel == null
                ? '$label: ${_fmt(value30)} total'
                : '$label: ${_fmt(value30)} overall, '
                    '$filtered30Label for $filterLabel',
            excludeSemantics: true,
            child: Text(
              mainLabel,
              softWrap: true,
              style: const TextStyle(
                fontFamily: AppFonts.serif,
                fontSize: 28,
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary,
              ),
            ),
          ),
          const SizedBox(height: 2),
          if (filterLabel != null)
            Text('All | $filterLabel',
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    color: AppColors.primary,
                    fontSize: 11,
                    fontWeight: FontWeight.w700)),
          Text(weekLabel,
              style: const TextStyle(color: AppColors.textMuted, fontSize: 12)),
        ],
      ),
    );
  }

  String _optionalFmt(int? value) => value == null ? '—' : _fmt(value);
}

class _DailyBars extends StatelessWidget {
  const _DailyBars({
    required this.days,
    this.filteredDays,
    this.filterLabel,
  });

  final List<AnalyticsDay> days;
  final List<AnalyticsDay>? filteredDays;
  final String? filterLabel;

  @override
  Widget build(BuildContext context) {
    final max =
        days.map((d) => d.count('visits')).fold(0, (a, b) => a > b ? a : b);
    final filteredByDay = {
      for (final day in filteredDays ?? const <AnalyticsDay>[])
        if (day.wasRecorded) day.key: day,
    };
    return Container(
      height: filterLabel == null ? 140 : 172,
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: max == 0
          ? const Center(
              child: Text('No visits recorded yet.',
                  style: TextStyle(color: AppColors.textMuted)))
          : Column(
              children: [
                Expanded(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      for (final day in days)
                        Expanded(
                          child: _DailyBar(
                            day: day,
                            filteredDay: filteredByDay[day.key],
                            max: max,
                            filterLabel: filterLabel,
                          ),
                        ),
                    ],
                  ),
                ),
                if (filterLabel != null) ...[
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const _LegendSwatch(
                          color: AppColors.accent, label: 'All traffic'),
                      const SizedBox(width: 14),
                      _LegendSwatch(
                          color: AppColors.primary, label: filterLabel!),
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
    required this.filteredDay,
    required this.max,
    required this.filterLabel,
  });

  final AnalyticsDay day;
  final AnalyticsDay? filteredDay;
  final int max;
  final String? filterLabel;

  @override
  Widget build(BuildContext context) {
    final total = day.count('visits');
    final filtered = filteredDay?.count('visits');
    final totalHeight = max == 0 ? 2.0 : 4 + 104 * total / max;
    final filteredHeight = filtered == null || max == 0
        ? 0.0
        : 4 + 104 * filtered.clamp(0, total) / max;
    final filteredLabel = filteredDay == null ? 'not recorded' : '$filtered';
    final message = filterLabel == null
        ? '${day.key}: $total visits'
        : '${day.key}: $total overall, $filteredLabel for $filterLabel';
    return Semantics(
      label: message,
      excludeSemantics: true,
      child: Tooltip(
        message: message,
        child: SizedBox(
          height: 110,
          child: Stack(
            alignment: Alignment.bottomCenter,
            children: [
              Container(
                margin: const EdgeInsets.symmetric(horizontal: 1.5),
                height: totalHeight,
                decoration: BoxDecoration(
                  color: total == 0 ? AppColors.surfaceAlt : AppColors.accent,
                  borderRadius:
                      const BorderRadius.vertical(top: Radius.circular(3)),
                ),
              ),
              if (filteredHeight > 0)
                FractionallySizedBox(
                  widthFactor: .56,
                  child: Container(
                    height: filteredHeight,
                    decoration: const BoxDecoration(
                      color: AppColors.primary,
                      borderRadius:
                          BorderRadius.vertical(top: Radius.circular(3)),
                    ),
                  ),
                ),
            ],
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
  const _FunnelCard({required this.summary, this.filterLabel});
  final AnalyticsSummary summary;
  final String? filterLabel;

  @override
  Widget build(BuildContext context) {
    final steps = <(String, int)>[
      ('Visits', summary.total('visits')),
      ('Opened app', summary.total('boots')),
      ('Uploaded denial', summary.funnel('upload')),
      ('Saw preview', summary.funnel('preview')),
      ('Started checkout', summary.funnel('checkout_started')),
      ('Paid', summary.funnel('paid')),
    ];
    final top = steps.first.$2;
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
              value: steps[i].$2,
              filterLabel: filterLabel,
              fraction: top == 0 ? 0 : steps[i].$2 / top,
              conversion: i == 0 || steps[i - 1].$2 == 0
                  ? null
                  : steps[i].$2 / steps[i - 1].$2,
            ),
          ],
        ],
      ),
    );
  }
}

class _FunnelRow extends StatelessWidget {
  const _FunnelRow({
    required this.label,
    required this.value,
    required this.fraction,
    this.filterLabel,
    this.conversion,
  });

  final String label;
  final int value;
  final double fraction;
  final String? filterLabel;

  /// Conversion from the previous step, null for the first row.
  final double? conversion;

  @override
  Widget build(BuildContext context) {
    final overallLabel = conversion == null
        ? '$value'
        : '$value (${(conversion! * 100).toStringAsFixed(1)}% conversion)';
    final valueLabel = filterLabel == null ? overallLabel : '$overallLabel | —';
    Widget bar() => ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: LinearProgressIndicator(
            value: fraction.clamp(0, 1),
            minHeight: 14,
            backgroundColor: AppColors.surfaceAlt,
            color: AppColors.accent,
          ),
        );
    return Semantics(
      label: filterLabel == null
          ? '$label: $valueLabel'
          : '$label: $overallLabel overall. Filtered funnel attribution is '
              'unavailable for $filterLabel.',
      excludeSemantics: true,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final scaledFont = MediaQuery.textScalerOf(context).scale(13);
          if (constraints.maxWidth < 430 || scaledFont > 17) {
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  label,
                  style: const TextStyle(
                      fontSize: 13, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 2),
                Text(
                  valueLabel,
                  style: const TextStyle(
                      fontSize: 13, color: AppColors.textSecondary),
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
                child: Text(label,
                    style: const TextStyle(
                        fontSize: 13, fontWeight: FontWeight.w600)),
              ),
              Expanded(child: bar()),
              SizedBox(
                width: 110,
                child: Text(
                  valueLabel,
                  textAlign: TextAlign.right,
                  style: const TextStyle(
                      fontSize: 13, color: AppColors.textSecondary),
                ),
              ),
            ],
          );
        },
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
  });

  final AnalyticsDimension dimension;
  final List<MapEntry<String, int>> entries;
  final List<MapEntry<String, int>>? filteredEntries;
  final AnalyticsFilter? selectedFilter;
  final ValueChanged<AnalyticsFilter> onSelect;
  final String emptyLabel;
  final String Function(String key)? labelForKey;

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
                if (selected != null)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(8, 4, 8, 6),
                    child: Align(
                      alignment: Alignment.centerRight,
                      child: Text(
                        'All | ${selected.label}',
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
                    overall: overall[key] ?? 0,
                    filtered: _filteredValue(
                      key,
                      overall: overall,
                      filtered: filtered,
                      filteredLoaded: filteredEntries != null,
                    ),
                    selected: selected?.dimension == dimension &&
                        selected?.key == key,
                    filterActive: selected != null,
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
    required this.overall,
    required this.filtered,
    required this.selected,
    required this.filterActive,
    required this.onTap,
  });

  final String label;
  final int overall;
  final int? filtered;
  final bool selected;
  final bool filterActive;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final valueLabel =
        filterActive ? '$overall | ${filtered ?? '—'}' : '$overall';
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
      label: filterActive
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
