import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/constants.dart';
import '../../core/theme.dart';
import '../../widgets/app_scaffold.dart';

/// Private traffic dashboard, fed by the first-party cookieless counters in
/// `analytics_daily`. Reachable at /#/stats; invisible to normal users and
/// unreadable by them (rules gate reads to the owner account).
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
            return const Center(
                child: CircularProgressIndicator(color: AppColors.primary));
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
  late Future<_Summary> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<_Summary> _load() async {
    // Range on the document id (day keys sort lexicographically) — unlike a
    // descending orderBy on __name__, this needs no composite index.
    final cutoff = DateFormat('yyyy-MM-dd')
        .format(DateTime.now().toUtc().subtract(const Duration(days: 29)));
    final qs = await FirebaseFirestore.instance
        .collection('analytics_daily')
        .where(FieldPath.documentId, isGreaterThanOrEqualTo: cutoff)
        .get();
    return _Summary.fromDocs(qs.docs);
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<_Summary>(
      future: _future,
      builder: (context, snap) {
        if (snap.hasError) {
          return Center(child: Text('Could not load stats: ${snap.error}'));
        }
        if (!snap.hasData) {
          return const Center(
              child: CircularProgressIndicator(color: AppColors.primary));
        }
        final s = snap.data!;
        return RefreshIndicator(
          color: AppColors.primary,
          onRefresh: () async => setState(() => _future = _load()),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 96, 20, 40),
            children: [
              Text('Last 30 days',
                  style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 4),
              const Text(
                'First-party counters — cookieless, aggregate-only.',
                style: TextStyle(color: AppColors.textMuted, fontSize: 13),
              ),
              const SizedBox(height: 20),
              Wrap(
                spacing: 12,
                runSpacing: 12,
                children: [
                  _StatTile('Visits', s.total('visits'), s.week('visits')),
                  _StatTile(
                      'Pageviews', s.total('pageviews'), s.week('pageviews')),
                  _StatTile('App opens', s.total('boots'), s.week('boots')),
                  _StatTile.money('Revenue', s.totalRevenueCents,
                      s.weekRevenueCents),
                ],
              ),
              const SizedBox(height: 28),
              const _SectionTitle('Daily visits'),
              _DailyBars(days: s.days),
              const SizedBox(height: 28),
              const _SectionTitle('Funnel (30 days)'),
              _FunnelCard(summary: s),
              const SizedBox(height: 28),
              const _SectionTitle('Top countries'),
              _TopList(
                entries: s.topCountries
                    .map((e) => MapEntry('${_flag(e.key)} ${e.key}', e.value))
                    .toList(),
                emptyLabel: 'No visits with a resolved country yet.',
              ),
              const SizedBox(height: 28),
              const _SectionTitle('Top referrers'),
              _TopList(entries: s.topReferrers, emptyLabel: 'Direct only so far.'),
              const SizedBox(height: 28),
              const _SectionTitle('Top pages'),
              _TopList(entries: s.topPaths, emptyLabel: 'No pageviews yet.'),
            ],
          ),
        );
      },
    );
  }
}

/// One day's counters plus helpers to aggregate windows.
class _Summary {
  _Summary(this.days);

  /// Oldest → newest, exactly 30 entries (missing days zero-filled).
  final List<_Day> days;

  factory _Summary.fromDocs(
      List<QueryDocumentSnapshot<Map<String, dynamic>>> docs) {
    final byKey = {for (final d in docs) d.id: d.data()};
    final today = DateTime.now().toUtc();
    final days = List.generate(30, (i) {
      final date = today.subtract(Duration(days: 29 - i));
      final key = DateFormat('yyyy-MM-dd').format(date);
      return _Day(key, byKey[key] ?? const {});
    });
    return _Summary(days);
  }

  int total(String field) =>
      days.fold(0, (acc, d) => acc + d.count(field));
  int week(String field) => days
      .skip(days.length - 7)
      .fold(0, (acc, d) => acc + d.count(field));
  int funnel(String step) =>
      days.fold(0, (acc, d) => acc + d.funnelCount(step));
  int get totalRevenueCents => total('revenueCents');
  int get weekRevenueCents => week('revenueCents');

  List<MapEntry<String, int>> _topOf(String mapField) {
    final merged = <String, int>{};
    for (final d in days) {
      (d.data[mapField] as Map<String, dynamic>? ?? const {})
          .forEach((k, v) => merged[k] = (merged[k] ?? 0) + (v as num).toInt());
    }
    final entries = merged.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    return entries.take(10).toList();
  }

  List<MapEntry<String, int>> get topReferrers => _topOf('referrers');
  List<MapEntry<String, int>> get topPaths => _topOf('paths');
  List<MapEntry<String, int>> get topCountries => _topOf('countries');
}

/// ISO 3166-1 alpha-2 code → flag emoji (regional indicator pair). Windows
/// has no flag glyphs and falls back to plain letters — harmless.
String _flag(String cc) => cc.length == 2
    ? String.fromCharCodes(cc.codeUnits.map((c) => 0x1F1E6 + (c - 0x41)))
    : '';

class _Day {
  _Day(this.key, this.data);
  final String key;
  final Map<String, dynamic> data;

  int count(String field) => ((data[field] ?? 0) as num).toInt();
  int funnelCount(String step) =>
      (((data['funnel'] as Map<String, dynamic>?)?[step] ?? 0) as num).toInt();
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
  const _StatTile(this.label, this.value30, this.value7) : money = false;
  const _StatTile.money(this.label, this.value30, this.value7) : money = true;

  final String label;
  final int value30;
  final int value7;
  final bool money;

  String _fmt(int v) => money
      ? '\$${(v / 100).toStringAsFixed(2)}'
      : NumberFormat.decimalPattern().format(v);

  @override
  Widget build(BuildContext context) {
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
          Text(_fmt(value30),
              style: const TextStyle(
                  fontFamily: AppFonts.serif,
                  fontSize: 28,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textPrimary)),
          const SizedBox(height: 2),
          Text('${_fmt(value7)} in last 7 days',
              style:
                  const TextStyle(color: AppColors.textMuted, fontSize: 12)),
        ],
      ),
    );
  }
}

class _DailyBars extends StatelessWidget {
  const _DailyBars({required this.days});
  final List<_Day> days;

  @override
  Widget build(BuildContext context) {
    final max = days
        .map((d) => d.count('visits'))
        .fold(0, (a, b) => a > b ? a : b);
    return Container(
      height: 140,
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
          : Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                for (final d in days)
                  Expanded(
                    child: Tooltip(
                      message: '${d.key}: ${d.count('visits')} visits',
                      child: Container(
                        margin: const EdgeInsets.symmetric(horizontal: 1.5),
                        height: max == 0
                            ? 2
                            : 4 + 104 * d.count('visits') / max,
                        decoration: BoxDecoration(
                          color: d.count('visits') == 0
                              ? AppColors.surfaceAlt
                              : AppColors.accent,
                          borderRadius: const BorderRadius.vertical(
                              top: Radius.circular(3)),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
    );
  }
}

class _FunnelCard extends StatelessWidget {
  const _FunnelCard({required this.summary});
  final _Summary summary;

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
    this.conversion,
  });

  final String label;
  final int value;
  final double fraction;

  /// Conversion from the previous step, null for the first row.
  final double? conversion;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        SizedBox(
          width: 150,
          child: Text(label,
              style: const TextStyle(
                  fontSize: 13, fontWeight: FontWeight.w600)),
        ),
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              value: fraction.clamp(0, 1),
              minHeight: 14,
              backgroundColor: AppColors.surfaceAlt,
              color: AppColors.accent,
            ),
          ),
        ),
        SizedBox(
          width: 110,
          child: Text(
            conversion == null
                ? '$value'
                : '$value  (${(conversion! * 100).toStringAsFixed(1)}%)',
            textAlign: TextAlign.right,
            style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
          ),
        ),
      ],
    );
  }
}

class _TopList extends StatelessWidget {
  const _TopList({required this.entries, required this.emptyLabel});
  final List<MapEntry<String, int>> entries;
  final String emptyLabel;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: entries.isEmpty
          ? Padding(
              padding: const EdgeInsets.all(8),
              child: Text(emptyLabel,
                  style: const TextStyle(color: AppColors.textMuted)),
            )
          : Column(
              children: [
                for (final e in entries)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(e.key,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                  fontFamily: AppFonts.mono, fontSize: 13)),
                        ),
                        Text('${e.value}',
                            style: const TextStyle(
                                fontWeight: FontWeight.w600, fontSize: 13)),
                      ],
                    ),
                  ),
              ],
            ),
    );
  }
}
