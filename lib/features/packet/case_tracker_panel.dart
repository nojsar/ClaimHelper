import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/theme.dart';
import '../../models/appeal_case.dart';
import '../../models/case_tracker.dart';
import '../../state/providers.dart';

const _externalReviewUrl = 'https://getmyyes.com/appeals/external-review';

/// Accessible, owner-only progress tracker shown inside the paid case packet.
class CaseTrackerPanel extends ConsumerStatefulWidget {
  const CaseTrackerPanel({super.key, required this.appealCase});
  final AppealCase appealCase;

  @override
  ConsumerState<CaseTrackerPanel> createState() => _CaseTrackerPanelState();
}

class _CaseTrackerPanelState extends ConsumerState<CaseTrackerPanel> {
  late DateTime _submittedDate;
  DateTime? _expectedResponseDate;
  DateTime? _responseDate;
  late SubmissionMethod _submissionMethod;
  late InsurerResponseStatus _responseStatus;
  late AppealOutcome _outcome;
  late bool _reminderEnabled;
  final _confirmation = TextEditingController();
  bool _saving = false;
  bool _dirty = false;
  String? _message;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load(widget.appealCase.caseTracker);
  }

  @override
  void didUpdateWidget(covariant CaseTrackerPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!_dirty &&
        oldWidget.appealCase.caseTracker?.updatedAt !=
            widget.appealCase.caseTracker?.updatedAt) {
      _load(widget.appealCase.caseTracker);
    }
  }

  void _load(CaseTracker? tracker) {
    final now = DateTime.now();
    _submittedDate =
        tracker?.submittedDate ?? DateTime(now.year, now.month, now.day);
    _expectedResponseDate = tracker?.expectedResponseDate;
    _responseDate = tracker?.responseDate;
    _submissionMethod =
        tracker?.submissionMethod ?? SubmissionMethod.onlinePortal;
    _responseStatus =
        tracker?.responseStatus ?? InsurerResponseStatus.noResponseYet;
    _outcome = tracker?.outcome ?? AppealOutcome.pending;
    _reminderEnabled = tracker?.responseReminderEnabled ?? true;
    _confirmation.text = tracker?.confirmationNumber ?? '';
  }

  @override
  void dispose() {
    _confirmation.dispose();
    super.dispose();
  }

  void _changed(VoidCallback update) {
    setState(() {
      update();
      _dirty = true;
      _message = null;
      _error = null;
    });
  }

  String _date(DateTime value) => '${value.month}/${value.day}/${value.year}';

  Future<void> _pickSubmittedDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _submittedDate,
      firstDate: DateTime(DateTime.now().year - 10),
      lastDate: DateTime.now().add(const Duration(days: 1)),
      helpText: 'Select appeal submission date',
    );
    if (picked != null) _changed(() => _submittedDate = picked);
  }

  Future<void> _pickExpectedDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate:
          _expectedResponseDate ?? _submittedDate.add(const Duration(days: 30)),
      firstDate: _submittedDate,
      lastDate: DateTime(
          _submittedDate.year + 3, _submittedDate.month, _submittedDate.day),
      helpText: 'Select expected insurer response date',
    );
    if (picked != null) _changed(() => _expectedResponseDate = picked);
  }

  Future<void> _pickResponseDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _responseDate ?? DateTime.now(),
      firstDate: _submittedDate,
      lastDate: DateTime.now().add(const Duration(days: 1)),
      helpText: 'Select insurer response date',
    );
    if (picked != null) _changed(() => _responseDate = picked);
  }

  Future<void> _save() async {
    if (_expectedResponseDate != null &&
        _expectedResponseDate!.isBefore(_submittedDate)) {
      setState(() => _error =
          'Expected response date cannot be before the submission date.');
      return;
    }
    if (_responseDate != null && _responseDate!.isBefore(_submittedDate)) {
      setState(
          () => _error = 'Response date cannot be before the submission date.');
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
      _message = null;
    });
    try {
      final tracker = CaseTracker(
        submittedDate: _submittedDate,
        submissionMethod: _submissionMethod,
        confirmationNumber: _confirmation.text.trim().isEmpty
            ? null
            : _confirmation.text.trim(),
        expectedResponseDate: _expectedResponseDate,
        responseDate: _responseDate,
        responseStatus: _responseStatus,
        outcome: _outcome,
        responseReminderEnabled: _reminderEnabled,
      );
      final reminderScheduled = await ref
          .read(backendProvider)
          .updateCaseTracker(widget.appealCase.id, tracker);
      ref.invalidate(caseStreamProvider(widget.appealCase.id));
      if (mounted) {
        setState(() {
          _dirty = false;
          _message = reminderScheduled
              ? 'Case tracker saved. We will email you when the response is due.'
              : 'Case tracker saved.';
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() =>
            _error = 'Could not save the case tracker. Please try again.');
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  String get _guidance {
    switch (_outcome) {
      case AppealOutcome.approved:
        return 'Confirm the approval appears in writing and that the claim or '
            'authorization is processed correctly. Keep the confirmation.';
      case AppealOutcome.partiallyApproved:
        return 'Compare the written decision with what you requested. Use a '
            'follow-up round for any treatment, dates, or amount still denied.';
      case AppealOutcome.denied:
        return 'Review the denial deadline now. A second-level appeal or an '
            'independent external review may be available.';
      case AppealOutcome.withdrawn:
        return 'Keep your submission and withdrawal records. You can update '
            'this tracker if the case is reopened.';
      case AppealOutcome.pending:
        break;
    }
    if (_responseStatus == InsurerResponseStatus.informationRequested) {
      return 'The insurer needs more information. Open Follow-ups with the '
          'request and any new documents before the response deadline.';
    }
    if (_expectedResponseDate != null &&
        !DateTime.now().isBefore(_expectedResponseDate!)) {
      return 'The expected response date has arrived. Check the insurer portal '
          'or call for status, then record the response here.';
    }
    return 'Keep proof of submission. If the insurer misses its expected '
        'response date, contact it for status and record what happens here.';
  }

  Widget _dateField({
    required String label,
    required DateTime? value,
    required VoidCallback onPressed,
    bool required = false,
    VoidCallback? onClear,
  }) {
    final valueLabel = value == null ? 'Not set' : _date(value);
    return Semantics(
      button: true,
      label: '$label, $valueLabel${required ? ', required' : ''}',
      child: Row(
        children: [
          Expanded(
            child: OutlinedButton.icon(
              onPressed: onPressed,
              icon: const Icon(Icons.calendar_today_outlined, size: 18),
              label: Align(
                alignment: Alignment.centerLeft,
                child: Text('$label: $valueLabel'),
              ),
            ),
          ),
          if (value != null && onClear != null) ...[
            const SizedBox(width: 6),
            IconButton(
              onPressed: onClear,
              tooltip: 'Clear $label',
              icon: const Icon(Icons.clear),
            ),
          ],
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Semantics(
          header: true,
          child: const Text(
            'Track your submitted appeal',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
          ),
        ),
        const SizedBox(height: 6),
        const Text(
          'Save proof and response dates here. Confirmation details stay in '
          'your private case and are never copied into analytics.',
          style: TextStyle(color: AppColors.textSecondary, height: 1.45),
        ),
        const SizedBox(height: 18),
        _dateField(
          label: 'Submitted date',
          value: _submittedDate,
          onPressed: _pickSubmittedDate,
          required: true,
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<SubmissionMethod>(
          initialValue: _submissionMethod,
          decoration: const InputDecoration(labelText: 'Submission method'),
          items: [
            for (final method in SubmissionMethod.values)
              DropdownMenuItem(value: method, child: Text(method.label)),
          ],
          onChanged: (value) {
            if (value != null) _changed(() => _submissionMethod = value);
          },
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _confirmation,
          maxLength: 120,
          autocorrect: false,
          textInputAction: TextInputAction.next,
          onChanged: (_) => _changed(() {}),
          decoration: const InputDecoration(
            labelText: 'Confirmation or reference number (optional)',
            helperText: 'Stored only in this private case.',
          ),
        ),
        const SizedBox(height: 4),
        _dateField(
          label: 'Expected response date',
          value: _expectedResponseDate,
          onPressed: _pickExpectedDate,
          onClear: () => _changed(() => _expectedResponseDate = null),
        ),
        SwitchListTile.adaptive(
          contentPadding: EdgeInsets.zero,
          value: _reminderEnabled,
          onChanged: (value) => _changed(() => _reminderEnabled = value),
          title: const Text('Email me when a response is due'),
          subtitle: const Text(
              'Uses the email on your signed-in account. No medical details are sent.'),
        ),
        const Divider(height: 32),
        DropdownButtonFormField<InsurerResponseStatus>(
          initialValue: _responseStatus,
          decoration: const InputDecoration(labelText: 'Insurer status'),
          items: [
            for (final status in InsurerResponseStatus.values)
              DropdownMenuItem(value: status, child: Text(status.label)),
          ],
          onChanged: (value) {
            if (value != null) _changed(() => _responseStatus = value);
          },
        ),
        const SizedBox(height: 12),
        _dateField(
          label: 'Response received date',
          value: _responseDate,
          onPressed: _pickResponseDate,
          onClear: () => _changed(() => _responseDate = null),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<AppealOutcome>(
          initialValue: _outcome,
          decoration: const InputDecoration(labelText: 'Current outcome'),
          items: [
            for (final outcome in AppealOutcome.values)
              DropdownMenuItem(value: outcome, child: Text(outcome.label)),
          ],
          onChanged: (value) {
            if (value != null) _changed(() => _outcome = value);
          },
        ),
        const SizedBox(height: 18),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: _outcome == AppealOutcome.denied
                ? AppColors.warningTint
                : AppColors.accentTint,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Semantics(
                liveRegion: true,
                label: 'Recommended next step: $_guidance',
                child: ExcludeSemantics(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Recommended next step',
                          style: TextStyle(fontWeight: FontWeight.w800)),
                      const SizedBox(height: 6),
                      Text(_guidance, style: const TextStyle(height: 1.45)),
                    ],
                  ),
                ),
              ),
              if (_outcome == AppealOutcome.denied) ...[
                const SizedBox(height: 10),
                TextButton.icon(
                  onPressed: () => launchUrl(Uri.parse(_externalReviewUrl)),
                  icon: const Icon(Icons.open_in_new, size: 18),
                  label: const Text('Review external-review options'),
                ),
              ],
            ],
          ),
        ),
        if (_error != null || _message != null) ...[
          const SizedBox(height: 12),
          Semantics(
            liveRegion: true,
            label: _error == null ? _message : 'Error: $_error',
            child: ExcludeSemantics(
              child: Text(
                _error ?? _message!,
                style: TextStyle(
                  color:
                      _error == null ? AppColors.accentBright : AppColors.error,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
        ],
        const SizedBox(height: 16),
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: _saving ? null : _save,
            icon: _saving
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white),
                  )
                : const Icon(Icons.save_outlined),
            label: Text(_saving ? 'Saving…' : 'Save case tracker'),
          ),
        ),
      ],
    );
  }
}
