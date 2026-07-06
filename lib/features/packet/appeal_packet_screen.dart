import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/constants.dart';
import '../../core/theme.dart';
import '../../models/appeal_case.dart';
import '../../models/follow_up.dart';
import '../../models/packet.dart';
import '../../state/providers.dart';
import '../../widgets/account_gate.dart';
import '../../widgets/app_scaffold.dart';

/// The paid deliverable. Tabs: Summary, Appeal Letter, Evidence, Doctor
/// Request, Call Script, Deadlines, plus a PDF export action. Entitlement is
/// enforced: if the case is not paid, we send the user back to the paywall.
class AppealPacketScreen extends ConsumerWidget {
  const AppealPacketScreen({super.key, required this.caseId});
  final String caseId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final caseAsync = ref.watch(caseStreamProvider(caseId));

    return caseAsync.when(
      loading: () => const AppScaffold(
        title: 'Appeal packet',
        child: Center(child: CircularProgressIndicator()),
      ),
      error: (e, _) => AppScaffold(
        title: 'Appeal packet',
        child: ErrorRetry(
          message: 'Could not load your packet.',
          onRetry: () => ref.invalidate(caseStreamProvider(caseId)),
        ),
      ),
      data: (c) {
        if (c == null) {
          return AppScaffold(
            title: 'Appeal packet',
            child: ErrorRetry(
              message: 'This case no longer exists.',
              onRetry: () => context.go('/'),
            ),
          );
        }
        if (!Entitlement.canViewFullPacket(c)) {
          return AppScaffold(
            title: 'Appeal packet',
            child: ErrorRetry(
              message: 'Unlock the full packet to view it.',
              onRetry: () => context.go('/case/$caseId/preview'),
            ),
          );
        }
        if (c.packet == null) {
          return _GeneratePrompt(caseId: caseId);
        }
        return _PacketTabs(appealCase: c);
      },
    );
  }
}

class _GeneratePrompt extends ConsumerStatefulWidget {
  const _GeneratePrompt({required this.caseId});
  final String caseId;
  @override
  ConsumerState<_GeneratePrompt> createState() => _GeneratePromptState();
}

class _GeneratePromptState extends ConsumerState<_GeneratePrompt> {
  bool _busy = false;
  String? _error;

  Future<void> _generate() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(backendProvider).generateAppealPacket(widget.caseId);
    } catch (_) {
      setState(() => _error = 'Generation failed. Please retry.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      title: 'Appeal packet',
      child: Center(
        child: _busy
            ? const Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CircularProgressIndicator(),
                  SizedBox(height: 16),
                  Text('Drafting your appeal packet…'),
                ],
              )
            : Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (_error != null) ...[
                    Text(_error!,
                        style: const TextStyle(color: AppColors.error)),
                    const SizedBox(height: 12),
                  ],
                  FilledButton.icon(
                    onPressed: _generate,
                    icon: const Icon(Icons.auto_awesome),
                    label: const Text('Generate my packet'),
                  ),
                ],
              ),
      ),
    );
  }
}

class _PacketTabs extends ConsumerStatefulWidget {
  const _PacketTabs({required this.appealCase});
  final AppealCase appealCase;
  @override
  ConsumerState<_PacketTabs> createState() => _PacketTabsState();
}

class _PacketTabsState extends ConsumerState<_PacketTabs> {
  bool _exporting = false;

  Future<void> _export() async {
    setState(() => _exporting = true);
    try {
      await ref.read(pdfServiceProvider).exportPacket(widget.appealCase);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('PDF export failed. Please try again.')));
      }
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final packet = widget.appealCase.packet!;
    const tabs = [
      Tab(text: 'Summary'),
      Tab(text: 'Appeal Letter'),
      Tab(text: 'Evidence'),
      Tab(text: 'Doctor Request'),
      Tab(text: 'Call Script'),
      Tab(text: 'Deadlines'),
      Tab(text: 'Follow-ups'),
    ];

    return DefaultTabController(
      length: tabs.length,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Your appeal packet'),
          actions: [
            _SaveCaseButton(appealCase: widget.appealCase),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: FilledButton.icon(
                onPressed: _exporting ? null : _export,
                icon: _exporting
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.picture_as_pdf, size: 18),
                label: const Text('Export PDF'),
              ),
            ),
          ],
          bottom: const TabBar(isScrollable: true, tabs: tabs),
        ),
        body: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 820),
              child: TabBarView(
                children: [
                  _SummaryTab(packet: packet),
                  _TextTab(
                    title: 'Appeal letter',
                    body: packet.appealLetter,
                    copyable: true,
                  ),
                  _EvidenceTab(items: packet.evidenceChecklist),
                  _TextTab(
                    title: 'Doctor letter request',
                    body: packet.doctorLetterRequest,
                    copyable: true,
                  ),
                  _TextTab(
                    title: 'Insurer call script',
                    body: packet.insurerCallScript,
                    copyable: true,
                  ),
                  _DeadlinesTab(items: packet.deadlineChecklist),
                  _FollowUpsTab(appealCase: widget.appealCase),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Post-appeal assistance: the insurer replied (or didn't) and the user wants
/// the next move. Every packet includes [Pricing.freeFollowUpRounds] rounds —
/// usable immediately, no waiting period. One round = one submission, so the
/// start dialog warns the user to include everything before confirming. When
/// rounds run out we offer a $19 single round or the capped Full Case bundle.
class _FollowUpsTab extends ConsumerStatefulWidget {
  const _FollowUpsTab({required this.appealCase});
  final AppealCase appealCase;

  @override
  ConsumerState<_FollowUpsTab> createState() => _FollowUpsTabState();
}

class _FollowUpsTabState extends ConsumerState<_FollowUpsTab> {
  bool _busy = false;

  static const _outcomes = [
    'Denied again',
    'Approved / partially approved',
    'They asked for more information',
    'No response yet',
    'Other',
  ];

  Future<void> _startRound() async {
    final remaining = widget.appealCase.remainingFollowUps;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(remaining == 1
            ? 'Your last included round'
            : 'Use a follow-up round?'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              remaining == 1
                  ? 'This is the only follow-up round you have left on this '
                      'case. After it, extra rounds are \$${Pricing.followUpRoundUsd} '
                      'each (or upgrade to Full Case).'
                  : 'This will use 1 of your $remaining remaining follow-up '
                      'rounds.',
              style: const TextStyle(fontWeight: FontWeight.w600, height: 1.4),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.warningTint,
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Text(
                'One round = one submission, so give it everything you have: '
                'paste the insurer\'s reply, phone-call outcomes, dates, '
                'reference numbers, and anything new from your doctor. You '
                'can use a round any time — even right now.',
                style: TextStyle(
                    fontSize: 13, height: 1.45, color: AppColors.warning),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Not yet')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('I have everything — continue')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    var outcome = _outcomes.first;
    final notesCtrl = TextEditingController();
    final submitted = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          scrollable: true,
          title: const Text('What happened?'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              DropdownButtonFormField<String>(
                initialValue: outcome,
                items: [
                  for (final o in _outcomes)
                    DropdownMenuItem(value: o, child: Text(o)),
                ],
                onChanged: (v) => setLocal(() => outcome = v ?? outcome),
                decoration: const InputDecoration(labelText: 'Outcome'),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: notesCtrl,
                minLines: 6,
                maxLines: 12,
                decoration: const InputDecoration(
                  labelText: 'Everything you have',
                  hintText: 'Paste the insurer\'s response letter here, plus '
                      'call notes, dates, reference numbers, and any new '
                      'information from your doctor…',
                  alignLabelWithHint: true,
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('Cancel')),
            FilledButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text('Draft my next move')),
          ],
        ),
      ),
    );
    if (submitted != true || !mounted) {
      notesCtrl.dispose();
      return;
    }
    final notes = notesCtrl.text.trim();
    notesCtrl.dispose();
    if (notes.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Please describe what happened first.')));
      return;
    }

    setState(() => _busy = true);
    try {
      await ref
          .read(backendProvider)
          .generateFollowUp(widget.appealCase.id, outcome: outcome, notes: notes);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Your follow-up round is ready below.')));
      }
    } catch (e) {
      if (mounted) {
        final msg = e.toString().contains('No follow-up rounds left')
            ? 'No follow-up rounds left — add a round below.'
            : 'Follow-up generation failed. Your round was not used — retry.';
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(msg)));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _buy(String kind) async {
    setState(() => _busy = true);
    try {
      final url = await ref
          .read(backendProvider)
          .createFollowUpCheckout(widget.appealCase.id, kind: kind);
      if (url != null) {
        await launchUrl(Uri.parse(url), webOnlyWindowName: '_self');
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Purchase applied to this case.')));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Checkout could not start. Please try again.')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.appealCase;
    final remaining = c.remainingFollowUps;

    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Row(
          children: [
            Expanded(child: _sectionTitle('After you send your appeal')),
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: remaining > 0
                    ? AppColors.accentTint
                    : AppColors.warningTint,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                c.fullCase
                    ? '$remaining rounds left · Full Case'
                    : '$remaining round${remaining == 1 ? '' : 's'} left',
                style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: remaining > 0
                        ? AppColors.accentBright
                        : AppColors.warning),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        const Text(
          'When the insurer replies — or ignores you — report back and we '
          'draft your next move: a second-level appeal, an external-review '
          'request, a records cover letter, or a status demand. You can use '
          'a round immediately; there\'s no waiting period.',
          style: TextStyle(color: AppColors.textSecondary, height: 1.5),
        ),
        const SizedBox(height: 16),
        if (remaining > 0)
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: _busy ? null : _startRound,
              icon: _busy
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.forward_to_inbox_rounded, size: 18),
              label: Text(_busy
                  ? 'Drafting your next move…'
                  : 'The insurer responded — start a follow-up'),
            ),
          )
        else
          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Out of included rounds',
                      style: TextStyle(
                          fontSize: 16, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 6),
                  const Text(
                    'Keep the case moving with one more round, or upgrade '
                    'to Full Case for the whole fight.',
                    style: TextStyle(
                        color: AppColors.textSecondary, height: 1.45),
                  ),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: _busy
                              ? null
                              : () => _buy('followup_round'),
                          child: Text(
                              'One round — \$${Pricing.followUpRoundUsd}'),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: FilledButton(
                          onPressed:
                              _busy ? null : () => _buy('full_case'),
                          child:
                              Text('Full Case — \$${Pricing.fullCaseUsd}'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Text(
                    'Full Case covers up to ${Pricing.fullCaseRoundsCap} '
                    'follow-up rounds on this case — plenty for any appeal, '
                    'but not unlimited.',
                    style: const TextStyle(
                        fontSize: 12, color: AppColors.textMuted),
                  ),
                ],
              ),
            ),
          ),
        if (c.followUps.isNotEmpty) ...[
          const SizedBox(height: 22),
          _sectionTitle('Your follow-up rounds'),
          const SizedBox(height: 8),
          for (var i = c.followUps.length - 1; i >= 0; i--)
            _FollowUpRoundCard(
                index: i + 1, round: c.followUps[i]),
        ],
      ],
    );
  }
}

class _FollowUpRoundCard extends StatelessWidget {
  const _FollowUpRoundCard({required this.index, required this.round});
  final int index;
  final FollowUpRound round;

  String get _dateLabel {
    final d = round.createdAt;
    if (d == null) return '';
    return '${d.year}-${d.month.toString().padLeft(2, '0')}-'
        '${d.day.toString().padLeft(2, '0')}';
  }

  Widget _copyableBlock(BuildContext context, String title, String body) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(title,
                  style: const TextStyle(
                      fontWeight: FontWeight.w700, fontSize: 14)),
            ),
            TextButton.icon(
              onPressed: () {
                Clipboard.setData(ClipboardData(text: body));
                ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Copied to clipboard')));
              },
              icon: const Icon(Icons.copy, size: 14),
              label: const Text('Copy', style: TextStyle(fontSize: 12.5)),
            ),
          ],
        ),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.surfaceAlt,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: AppColors.border),
          ),
          child: SelectableText(body,
              style: const TextStyle(height: 1.5, fontSize: 13.5)),
        ),
        const SizedBox(height: 12),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: ExpansionTile(
        shape: const Border(),
        title: Text('Round $index — ${round.outcome}',
            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5)),
        subtitle: _dateLabel.isEmpty
            ? null
            : Text(_dateLabel,
                style: const TextStyle(
                    fontSize: 12, color: AppColors.textMuted)),
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        expandedCrossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(round.situationSummary,
              style: const TextStyle(height: 1.5, fontSize: 13.5)),
          const SizedBox(height: 12),
          const Text('Recommended next steps',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
          const SizedBox(height: 4),
          Text(round.recommendedNextSteps,
              style: const TextStyle(height: 1.5, fontSize: 13.5)),
          const SizedBox(height: 12),
          _copyableBlock(context, 'Your next letter', round.responseLetter),
          _copyableBlock(context, 'Updated call script', round.callScript),
          if (round.deadlineNotes != null &&
              round.deadlineNotes!.trim().isNotEmpty) ...[
            const Text('Deadlines',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
            const SizedBox(height: 4),
            Text(round.deadlineNotes!,
                style: const TextStyle(height: 1.5, fontSize: 13.5)),
            const SizedBox(height: 12),
          ],
          if (round.warnings.isNotEmpty) ...[
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.warningTint,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final w in round.warnings)
                    Text('• $w',
                        style: const TextStyle(
                            color: AppColors.warning,
                            fontSize: 12.5,
                            height: 1.5)),
                ],
              ),
            ),
            const SizedBox(height: 12),
          ],
          Text(round.disclaimer,
              style: const TextStyle(
                  fontSize: 11.5,
                  fontStyle: FontStyle.italic,
                  color: AppColors.textMuted)),
        ],
      ),
    );
  }
}

/// Save-case action with real feedback. The backend rejects anonymous
/// sessions ("create an account to save"), which previously surfaced as a
/// button that silently did nothing — now we gate through account creation
/// (linking keeps the same uid, so the paid case stays owned) and always
/// show a result.
class _SaveCaseButton extends ConsumerStatefulWidget {
  const _SaveCaseButton({required this.appealCase});
  final AppealCase appealCase;

  @override
  ConsumerState<_SaveCaseButton> createState() => _SaveCaseButtonState();
}

class _SaveCaseButtonState extends ConsumerState<_SaveCaseButton> {
  bool _busy = false;

  Future<void> _save() async {
    if (ref.read(authProvider).isAnonymous) {
      final ok = await ensureAccount(
        context,
        ref,
        title: 'Create an account to save',
        reason: 'Saving keeps this case and its documents on your account. '
            'Without it, unsaved files auto-delete after 24 hours.',
      );
      if (!ok || !mounted) return;
    }
    setState(() => _busy = true);
    try {
      await ref.read(backendProvider).saveCase(widget.appealCase.id);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Case saved to your account.')));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Could not save this case. Please try again.')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.appealCase.saved) {
      return const IconButton(
        tooltip: 'Saved to your account',
        icon: Icon(Icons.bookmark_added, color: AppColors.accent),
        onPressed: null,
      );
    }
    return IconButton(
      tooltip: 'Save case',
      icon: _busy
          ? const SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(strokeWidth: 2))
          : const Icon(Icons.bookmark_border),
      onPressed: _busy ? null : _save,
    );
  }
}

class _SummaryTab extends StatelessWidget {
  const _SummaryTab({required this.packet});
  final AppealPacket packet;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        _sectionTitle('Plain-English summary'),
        Text(packet.plainEnglishSummary),
        const SizedBox(height: 20),
        _sectionTitle('Appeal strategy'),
        Text(packet.appealStrategy),
        if (packet.warnings.isNotEmpty) ...[
          const SizedBox(height: 20),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.warningTint,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppColors.warning.withValues(alpha: 0.35)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Important',
                    style: TextStyle(
                        fontWeight: FontWeight.w700, color: AppColors.warning)),
                const SizedBox(height: 6),
                for (final w in packet.warnings)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 2),
                    child: Text('• $w',
                        style: const TextStyle(color: AppColors.warning)),
                  ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 20),
        _DisclaimerFooter(text: packet.disclaimer),
      ],
    );
  }
}

class _TextTab extends StatelessWidget {
  const _TextTab({
    required this.title,
    required this.body,
    this.copyable = false,
  });
  final String title;
  final String body;
  final bool copyable;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Row(
          children: [
            Expanded(child: _sectionTitle(title)),
            if (copyable)
              TextButton.icon(
                onPressed: () {
                  Clipboard.setData(ClipboardData(text: body));
                  ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Copied to clipboard')));
                },
                icon: const Icon(Icons.copy, size: 16),
                label: const Text('Copy'),
              ),
          ],
        ),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppColors.border),
          ),
          child: SelectableText(body,
              style: const TextStyle(height: 1.5, fontSize: 14)),
        ),
      ],
    );
  }
}

class _EvidenceTab extends StatelessWidget {
  const _EvidenceTab({required this.items});
  final List<EvidenceItem> items;

  Color _statusColor(String status) => switch (status) {
        'provided' => AppColors.accent,
        'missing' => AppColors.error,
        _ => AppColors.textSecondary,
      };

  IconData _statusIcon(String status) => switch (status) {
        'provided' => Icons.check_circle,
        'missing' => Icons.error_outline,
        _ => Icons.info_outline,
      };

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        _sectionTitle('Evidence checklist'),
        const SizedBox(height: 8),
        for (final e in items)
          Card(
            child: ListTile(
              leading: Icon(_statusIcon(e.status),
                  color: _statusColor(e.status)),
              title: Text(e.item,
                  style: const TextStyle(fontWeight: FontWeight.w600)),
              subtitle: Text(e.whyNeeded),
              trailing: Text(e.status,
                  style: TextStyle(
                      color: _statusColor(e.status),
                      fontWeight: FontWeight.w600,
                      fontSize: 12)),
            ),
          ),
      ],
    );
  }
}

class _DeadlinesTab extends StatelessWidget {
  const _DeadlinesTab({required this.items});
  final List<DeadlineItem> items;

  Color _priColor(String p) => switch (p) {
        'high' => AppColors.error,
        'medium' => AppColors.warning,
        _ => AppColors.textSecondary,
      };

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        _sectionTitle('Deadlines & reminders'),
        const SizedBox(height: 8),
        for (final d in items)
          Card(
            child: ListTile(
              leading: Icon(Icons.event, color: _priColor(d.priority)),
              title: Text(d.task),
              subtitle: Text(d.dueDate ?? 'Confirm date with your insurer'),
              trailing: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: _priColor(d.priority).withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(d.priority,
                    style: TextStyle(
                        color: _priColor(d.priority),
                        fontSize: 12,
                        fontWeight: FontWeight.w600)),
              ),
            ),
          ),
      ],
    );
  }
}

class _DisclaimerFooter extends StatelessWidget {
  const _DisclaimerFooter({required this.text});
  final String text;
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surfaceAlt,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(text,
          style: const TextStyle(
              fontSize: 12,
              fontStyle: FontStyle.italic,
              color: AppColors.textSecondary)),
    );
  }
}

Widget _sectionTitle(String text) => Text(
      text,
      style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
    );
