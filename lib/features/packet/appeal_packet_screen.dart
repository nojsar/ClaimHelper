import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme.dart';
import '../../models/appeal_case.dart';
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
                ],
              ),
            ),
          ),
        ),
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
              color: const Color(0xFFFFF7ED),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: const Color(0xFFFED7AA)),
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
        color: const Color(0xFFF1F5F9),
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
