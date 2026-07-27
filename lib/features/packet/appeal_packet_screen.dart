import 'package:flutter/foundation.dart' show kIsWeb;
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
import '../../widgets/ui.dart';
import 'case_tracker_panel.dart';

/// The paid deliverable. Tabs: Summary, Appeal Letter, Evidence, Doctor
/// Request, Call Script, Deadlines, plus a PDF export action. Entitlement is
/// enforced: if the case is not paid, we send the user back to the paywall.
class AppealPacketScreen extends ConsumerWidget {
  const AppealPacketScreen({
    super.key,
    required this.caseId,
    this.initialTab,
  });
  final String caseId;

  /// A bounded route hint only. Unknown values deliberately start on Summary.
  final String? initialTab;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final caseAsync = ref.watch(caseStreamProvider(caseId));

    return caseAsync.when(
      loading: () => AppScaffold(
        title: 'Appeal packet',
        child: Center(
          child: Semantics(
            liveRegion: true,
            label: 'Loading your appeal packet',
            child: CircularProgressIndicator(),
          ),
        ),
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
        return _PacketTabs(appealCase: c, initialTab: initialTab);
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
            ? Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Semantics(
                    liveRegion: true,
                    label: 'Drafting your appeal packet',
                    child: CircularProgressIndicator(),
                  ),
                  SizedBox(height: 16),
                  Text('Drafting your appeal packet…'),
                ],
              )
            : Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (_error != null) ...[
                    Semantics(
                      liveRegion: true,
                      label: 'Error: ${_error!}',
                      child: ExcludeSemantics(
                        child: Text(_error!,
                            style: const TextStyle(color: AppColors.error)),
                      ),
                    ),
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
  const _PacketTabs({required this.appealCase, this.initialTab});
  final AppealCase appealCase;
  final String? initialTab;
  @override
  ConsumerState<_PacketTabs> createState() => _PacketTabsState();
}

class _PacketTabsState extends ConsumerState<_PacketTabs> {
  bool _exportingPdf = false;
  bool _exportingHtml = false;

  Future<void> _export() async {
    setState(() => _exportingPdf = true);
    try {
      await ref.read(pdfServiceProvider).exportPacket(widget.appealCase);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('PDF downloaded.')));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('PDF export failed. Please try again.')));
      }
    } finally {
      if (mounted) setState(() => _exportingPdf = false);
    }
  }

  Future<void> _exportAccessibleHtml() async {
    setState(() => _exportingHtml = true);
    try {
      await ref
          .read(accessibleHtmlServiceProvider)
          .exportPacket(widget.appealCase);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Accessible HTML packet downloaded.')));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('HTML export failed. Please try again.')));
      }
    } finally {
      if (mounted) setState(() => _exportingHtml = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final packet = widget.appealCase.packet!;
    final media = MediaQuery.of(context);
    final compactActions =
        media.size.width < 680 || media.textScaler.scale(14) > 20;
    final exporting = _exportingPdf || _exportingHtml;
    const tabs = [
      Tab(text: 'Summary'),
      Tab(text: 'Appeal Letter'),
      Tab(text: 'Evidence'),
      Tab(text: 'Doctor Request'),
      Tab(text: 'Call Script'),
      Tab(text: 'Deadlines'),
      Tab(text: 'Case tracker'),
      Tab(text: 'Follow-ups'),
      Tab(text: 'Feedback'),
    ];
    final initialIndex = widget.initialTab == 'feedback' ? tabs.length - 1 : 0;

    return Title(
      color: AppColors.primary,
      title: 'Appeal packet | GetMyYes',
      child: DefaultTabController(
        length: tabs.length,
        initialIndex: initialIndex,
        child: Scaffold(
          appBar: AppBar(
            title: const Text('Your appeal packet'),
            actions: [
              _SaveCaseButton(appealCase: widget.appealCase),
              if (compactActions)
                PopupMenuButton<String>(
                  enabled: !exporting,
                  tooltip: exporting ? 'Downloading packet' : 'Download packet',
                  icon: exporting
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.download_outlined),
                  onSelected: (value) {
                    if (value == 'html') {
                      _exportAccessibleHtml();
                    } else {
                      _export();
                    }
                  },
                  itemBuilder: (context) => [
                    if (kIsWeb)
                      const PopupMenuItem(
                        value: 'html',
                        child: Text('Download accessible HTML'),
                      ),
                    const PopupMenuItem(
                      value: 'pdf',
                      child: Text('Export PDF'),
                    ),
                  ],
                )
              else ...[
                if (kIsWeb)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: OutlinedButton.icon(
                      onPressed: exporting ? null : _exportAccessibleHtml,
                      icon: _exportingHtml
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2))
                          : const Icon(Icons.html_outlined, size: 18),
                      label: const Text('Accessible HTML'),
                    ),
                  ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: FilledButton.icon(
                    onPressed: exporting ? null : _export,
                    icon: _exportingPdf
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
            ],
            bottom: const TabBar(isScrollable: true, tabs: tabs),
          ),
          body: SafeArea(
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 820),
                child: TabBarView(
                  children: [
                    _SummaryTab(
                      appealCase: widget.appealCase,
                      packet: packet,
                    ),
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
                    CaseTrackerPanel(appealCase: widget.appealCase),
                    _FollowUpsTab(appealCase: widget.appealCase),
                    _FeedbackTab(appealCase: widget.appealCase),
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

/// Post-appeal assistance: the insurer replied (or didn't) and the user wants
/// the next move. Every packet includes [Pricing.freeFollowUpRounds] rounds —
/// usable immediately, no waiting period. One round = one submission, so the
/// start dialog warns the user to include everything before confirming. When
/// rounds run out we offer a single round or the capped Full Case bundle. The
/// prices come from the backend config, so they are not repeated here.
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
        scrollable: true,
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
                maxLength: 20000,
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
      await ref.read(backendProvider).generateFollowUp(widget.appealCase.id,
          outcome: outcome, notes: notes);
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
        Wrap(
          spacing: 12,
          runSpacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            _sectionTitle('After you send your appeal'),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
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
                      style:
                          TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 6),
                  const Text(
                    'Keep the case moving with one more round, or upgrade '
                    'to Full Case for a larger capped drafting bundle.',
                    style:
                        TextStyle(color: AppColors.textSecondary, height: 1.45),
                  ),
                  const SizedBox(height: 14),
                  ResponsiveActions(
                    children: [
                      OutlinedButton(
                        onPressed: _busy ? null : () => _buy('followup_round'),
                        child:
                            Text('One round — \$${Pricing.followUpRoundUsd}'),
                      ),
                      FilledButton(
                        onPressed: _busy ? null : () => _buy('full_case'),
                        child:
                            Text('Upgrade — \$${Pricing.fullCaseUpgradeUsd}'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Text(
                    'Full Case covers up to ${Pricing.fullCaseRoundsCap} '
                    'follow-up drafting rounds on this case. Your total is '
                    '\$${Pricing.fullCaseUsd} including the packet you already '
                    'bought. No outcome is guaranteed.',
                    style: const TextStyle(
                        fontSize: 12, color: AppColors.textMuted),
                  ),
                ],
              ),
            ),
          ),
        if (!c.fullCase && c.followUps.isNotEmpty && remaining > 0) ...[
          const SizedBox(height: 20),
          _FullCaseUpgradeCard(appealCase: c),
        ],
        if (c.followUps.isNotEmpty) ...[
          const SizedBox(height: 22),
          _sectionTitle('Your follow-up rounds'),
          const SizedBox(height: 8),
          for (var i = c.followUps.length - 1; i >= 0; i--)
            _FollowUpRoundCard(index: i + 1, round: c.followUps[i]),
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
            style:
                const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5)),
        subtitle: _dateLabel.isEmpty
            ? null
            : Text(_dateLabel,
                style:
                    const TextStyle(fontSize: 12, color: AppColors.textMuted)),
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
    final ok = await ensureAccount(
      context,
      ref,
      caseId: widget.appealCase.id,
      title: 'Create an account to save',
      reason: 'Saving keeps this case and its documents on your account. '
          'Without it, unsaved files auto-delete after 24 hours.',
    );
    if (!ok || !mounted) return;
    setState(() => _busy = true);
    try {
      await ref.read(backendProvider).saveCase(widget.appealCase.id);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Case saved to your account.')));
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

/// A neutral getting-started plan. It does not infer readiness, submit
/// anything, or promise an outcome; each button only opens existing packet
/// material the customer can review at their own pace.
class _NextActionsChecklist extends StatelessWidget {
  const _NextActionsChecklist();

  void _openTab(BuildContext context, int index) {
    DefaultTabController.of(context).animateTo(index);
  }

  @override
  Widget build(BuildContext context) {
    const actions = [
      (
        title: 'Review the appeal letter',
        detail:
            'Check names, dates, facts, and the denial reason before using it.',
        tab: 1,
        icon: Icons.article_outlined,
      ),
      (
        title: 'Gather provider evidence',
        detail: 'Use the evidence checklist and doctor request as needed.',
        tab: 2,
        icon: Icons.fact_check_outlined,
      ),
      (
        title: 'Submit through your plan\'s process',
        detail:
            'Confirm the address, portal steps, and deadline in your notice.',
        tab: 5,
        icon: Icons.send_outlined,
      ),
      (
        title: 'Record the proof of submission',
        detail:
            'Save the date, method, and confirmation reference in your case tracker.',
        tab: 6,
        icon: Icons.bookmark_added_outlined,
      ),
      (
        title: 'Use your included follow-up drafts if needed',
        detail:
            'When the insurer replies or misses a response date, return here.',
        tab: 7,
        icon: Icons.reply_all_outlined,
      ),
    ];

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Next actions',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 6),
            const Text(
              'Work through these in the order that fits your notice. You remain responsible for reviewing every document and confirming your plan\'s requirements.',
              style: TextStyle(color: AppColors.textSecondary, height: 1.45),
            ),
            const SizedBox(height: 10),
            for (var index = 0; index < actions.length; index++)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: CircleAvatar(
                  radius: 15,
                  backgroundColor: AppColors.primaryTint,
                  foregroundColor: AppColors.primaryDark,
                  child: Text('${index + 1}'),
                ),
                title: Text(actions[index].title),
                subtitle: Text(actions[index].detail),
                trailing: Icon(actions[index].icon),
                onTap: () => _openTab(context, actions[index].tab),
              ),
          ],
        ),
      ),
    );
  }
}

/// Optional expansion of an already-paid packet. It reuses the existing
/// server-side `full_case` checkout, which remains authoritative for pricing,
/// eligibility, and the cap; this UI never grants rounds locally.
class _FullCaseUpgradeCard extends ConsumerStatefulWidget {
  const _FullCaseUpgradeCard({required this.appealCase});
  final AppealCase appealCase;

  @override
  ConsumerState<_FullCaseUpgradeCard> createState() =>
      _FullCaseUpgradeCardState();
}

class _FullCaseUpgradeCardState extends ConsumerState<_FullCaseUpgradeCard> {
  bool _starting = false;

  Future<void> _upgrade() async {
    if (_starting) return;
    setState(() => _starting = true);
    try {
      final url = await ref
          .read(backendProvider)
          .createFollowUpCheckout(widget.appealCase.id, kind: 'full_case');
      if (url != null) {
        await launchUrl(Uri.parse(url), webOnlyWindowName: '_self');
      } else if (mounted) {
        ref.invalidate(caseStreamProvider(widget.appealCase.id));
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Full Case is active for this case.')),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text('Checkout could not start. Please try again.')),
        );
      }
    } finally {
      if (mounted) setState(() => _starting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Want a larger follow-up drafting bundle?',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 6),
            Text(
              'Optional: upgrade this paid packet to Full Case for \$${Pricing.fullCaseUpgradeUsd} more. It provides up to ${Pricing.fullCaseRoundsCap} follow-up drafting rounds total for this case. Your current packet stays available, and no appeal outcome is guaranteed.',
              style:
                  const TextStyle(color: AppColors.textSecondary, height: 1.45),
            ),
            const SizedBox(height: 14),
            FilledButton.icon(
              onPressed: _starting ? null : _upgrade,
              icon: _starting
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.add_task_outlined),
              label: Text(
                _starting
                    ? 'Starting checkout…'
                    : 'Upgrade to Full Case — \$${Pricing.fullCaseUpgradeUsd}',
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SummaryTab extends StatelessWidget {
  const _SummaryTab({
    required this.appealCase,
    required this.packet,
  });

  final AppealCase appealCase;
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
        const SizedBox(height: 24),
        _NextActionsChecklist(),
        if (packet.warnings.isNotEmpty) ...[
          const SizedBox(height: 20),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.warningTint,
              borderRadius: BorderRadius.circular(10),
              border:
                  Border.all(color: AppColors.warning.withValues(alpha: 0.35)),
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
        if (!appealCase.fullCase) ...[
          _FullCaseUpgradeCard(appealCase: appealCase),
          const SizedBox(height: 20),
        ],
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
              leading:
                  Icon(_statusIcon(e.status), color: _statusColor(e.status)),
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
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
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

/// Voluntary, fixed-choice feedback. A single transactional reminder may be
/// emailed about 14 days after purchase if the form is still unanswered; no
/// free text, case detail, marketing sequence, or automatic publication.
class _FeedbackTab extends ConsumerStatefulWidget {
  const _FeedbackTab({required this.appealCase});
  final AppealCase appealCase;

  @override
  ConsumerState<_FeedbackTab> createState() => _FeedbackTabState();
}

class _FeedbackTabState extends ConsumerState<_FeedbackTab> {
  String? _satisfaction;
  String? _outcome;
  bool _testimonialPermission = false;
  bool _saving = false;
  bool _saved = false;

  Future<void> _save() async {
    final satisfaction = _satisfaction;
    final outcome = _outcome;
    if (satisfaction == null || outcome == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Choose a satisfaction rating and current outcome.'),
      ));
      return;
    }
    setState(() => _saving = true);
    try {
      await ref.read(backendProvider).saveCaseFeedback(
            widget.appealCase.id,
            satisfaction: satisfaction,
            outcome: outcome,
            testimonialPermission: _testimonialPermission,
          );
      if (mounted) setState(() => _saved = true);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Could not save feedback. Please retry.'),
        ));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final existing = widget.appealCase.feedback;
    if (existing != null || _saved) {
      return ListView(
        padding: const EdgeInsets.all(20),
        children: const [
          Card(
            child: Padding(
              padding: EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.check_circle_outline, color: AppColors.accent),
                  SizedBox(height: 10),
                  Text('Thanks — your private feedback was saved.',
                      style: TextStyle(fontWeight: FontWeight.w800)),
                  SizedBox(height: 6),
                  Text(
                    'Only your fixed choices were saved. Nothing is published automatically.',
                    style:
                        TextStyle(color: AppColors.textSecondary, height: 1.45),
                  ),
                ],
              ),
            ),
          ),
        ],
      );
    }
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        _sectionTitle('How was this packet?'),
        const SizedBox(height: 8),
        const Text(
          'Optional. Choose only the fixed options below — do not include medical, insurance, or personal details. Your choices help us improve the product. If you do not respond here, we may send one transactional feedback request about two weeks after purchase; it is not marketing.',
          style: TextStyle(color: AppColors.textSecondary, height: 1.45),
        ),
        const SizedBox(height: 20),
        DropdownButtonFormField<String>(
          initialValue: _satisfaction,
          decoration: const InputDecoration(labelText: 'Satisfaction'),
          items: const [
            DropdownMenuItem(
                value: 'very_dissatisfied', child: Text('Very dissatisfied')),
            DropdownMenuItem(
                value: 'dissatisfied', child: Text('Dissatisfied')),
            DropdownMenuItem(value: 'neutral', child: Text('Neutral')),
            DropdownMenuItem(value: 'satisfied', child: Text('Satisfied')),
            DropdownMenuItem(
                value: 'very_satisfied', child: Text('Very satisfied')),
          ],
          onChanged:
              _saving ? null : (value) => setState(() => _satisfaction = value),
        ),
        const SizedBox(height: 14),
        DropdownButtonFormField<String>(
          initialValue: _outcome,
          decoration:
              const InputDecoration(labelText: 'Current appeal outcome'),
          items: const [
            DropdownMenuItem(
                value: 'not_submitted_yet', child: Text('Not submitted yet')),
            DropdownMenuItem(
                value: 'submitted_waiting',
                child: Text('Submitted — waiting for a response')),
            DropdownMenuItem(value: 'approved', child: Text('Approved')),
            DropdownMenuItem(
                value: 'partially_approved', child: Text('Partially approved')),
            DropdownMenuItem(value: 'denied', child: Text('Denied')),
            DropdownMenuItem(value: 'withdrawn', child: Text('Withdrawn')),
          ],
          onChanged:
              _saving ? null : (value) => setState(() => _outcome = value),
        ),
        const SizedBox(height: 14),
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          value: _testimonialPermission,
          onChanged: _saving
              ? null
              : (value) =>
                  setState(() => _testimonialPermission = value ?? false),
          title:
              const Text('You may contact me about an anonymized testimonial'),
          subtitle: const Text(
            'This does not publish anything. We would ask again before using a quote, and never include case details.',
          ),
          controlAffinity: ListTileControlAffinity.leading,
        ),
        const SizedBox(height: 12),
        FilledButton(
          onPressed: _saving ? null : _save,
          child: _saving
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: Colors.white),
                )
              : const Text('Save feedback'),
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

Widget _sectionTitle(String text) => Semantics(
      header: true,
      child: Text(
        text,
        style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
      ),
    );
