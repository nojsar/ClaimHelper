import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme.dart';
import '../../models/extraction.dart';
import '../../state/intake_controller.dart';
import '../../widgets/app_scaffold.dart';

/// Editable review of the AI-extracted fields. Everything is correctable so
/// the packet is built from facts the user confirmed. Missing fields are
/// clearly marked "unknown".
class ExtractionReviewScreen extends ConsumerStatefulWidget {
  const ExtractionReviewScreen({super.key, required this.caseId});
  final String caseId;

  @override
  ConsumerState<ExtractionReviewScreen> createState() =>
      _ExtractionReviewScreenState();
}

class _ExtractionReviewScreenState
    extends ConsumerState<ExtractionReviewScreen> {
  late DenialExtraction _ex;
  final _controllers = <String, TextEditingController>{};
  bool _initialized = false;
  bool _saving = false;
  String? _loadError;
  String? _saveError;

  @override
  void initState() {
    super.initState();
    final intake = ref.read(intakeControllerProvider);
    final current = intake.caseId == widget.caseId ? intake.extraction : null;
    if (current != null) {
      _ex = current;
      _initialized = true;
    } else {
      WidgetsBinding.instance.addPostFrameCallback((_) => _restore());
    }
  }

  Future<void> _restore() async {
    if (mounted) setState(() => _loadError = null);
    try {
      await ref
          .read(intakeControllerProvider.notifier)
          .restoreCase(widget.caseId);
      final restored = ref.read(intakeControllerProvider).extraction;
      if (restored == null) {
        throw StateError('The document has not finished processing.');
      }
      if (!mounted) return;
      setState(() {
        _ex = restored;
        _initialized = true;
      });
    } catch (_) {
      if (mounted) {
        setState(() => _loadError =
            'We could not restore the extracted details. Please retry.');
      }
    }
  }

  TextEditingController _ctrl(String key, String? value) => _controllers
      .putIfAbsent(key, () => TextEditingController(text: value ?? ''));

  String? _clean(String key) {
    final v = _controllers[key]?.text.trim();
    return (v == null || v.isEmpty) ? null : v;
  }

  double? _num(String key) {
    final v = _clean(key);
    if (v == null) return null;
    return double.tryParse(v.replaceAll(RegExp(r'[^0-9.]'), ''));
  }

  DenialExtraction _collect() => _ex.copyWith(
        insurerName: _clean('insurerName'),
        planName: _clean('planName'),
        patientName: _clean('patientName'),
        claimNumber: _clean('claimNumber'),
        priorAuthNumber: _clean('priorAuthNumber'),
        deniedItem: _clean('deniedItem'),
        providerName: _clean('providerName'),
        prescriberName: _clean('prescriberName'),
        denialDate: _clean('denialDate'),
        appealDeadline: _clean('appealDeadline'),
        denialReasonText: _clean('denialReasonText'),
        amountBilled: _num('amountBilled'),
        patientResponsibility: _num('patientResponsibility'),
      );

  Future<void> _continue() async {
    if (_saving) return;
    setState(() {
      _saving = true;
      _saveError = null;
    });

    final updated = _collect();
    final ctrl = ref.read(intakeControllerProvider.notifier);
    ctrl.updateExtraction(updated);
    try {
      await ctrl.persistExtraction();
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _saveError =
            'We could not save these details. Check your connection and try again.';
      });
      return;
    }

    if (!mounted) return;
    setState(() => _saving = false);
    context.go('/case/${widget.caseId}/questions');
  }

  @override
  void dispose() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_initialized) {
      return AppScaffold(
        title: 'Review',
        child: _loadError == null
            ? const Center(child: CircularProgressIndicator())
            : ErrorRetry(message: _loadError!, onRetry: _restore),
      );
    }

    final primaryKeys = <String>{
      'insurerName',
      'deniedItem',
      'appealDeadline',
      'denialReasonText',
      if (_ex.denialCategory == DenialCategory.priorAuthorization)
        'priorAuthNumber'
      else
        'claimNumber',
      if ({
        DenialCategory.medication,
        DenialCategory.stepTherapy,
        DenialCategory.formularyExclusion,
      }.contains(_ex.denialCategory))
        'prescriberName'
      else
        'providerName',
    };

    return AppScaffold(
      title: 'Review extracted facts',
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Semantics(
              header: true,
              child: Text('Check the details',
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
            ),
            const SizedBox(height: 6),
            const Text(
              'We pulled out the details that shape your preview. Check these '
              'essentials; everything else is available below if you want to '
              'review it.',
              style: TextStyle(color: AppColors.textSecondary),
            ),
            const SizedBox(height: 20),
            _CategoryPicker(
              label: 'Denial type',
              value: _ex.denialCategory,
              onChanged: (v) =>
                  setState(() => _ex = _ex.copyWith(denialCategory: v)),
            ),
            const SizedBox(height: 16),
            _field('Insurance company', 'insurerName', _ex.insurerName),
            if (primaryKeys.contains('claimNumber'))
              _field('Claim number', 'claimNumber', _ex.claimNumber),
            if (primaryKeys.contains('priorAuthNumber'))
              _field(
                  'Prior-auth number', 'priorAuthNumber', _ex.priorAuthNumber),
            _field('Service / drug denied', 'deniedItem', _ex.deniedItem),
            if (primaryKeys.contains('providerName'))
              _field('Provider', 'providerName', _ex.providerName),
            if (primaryKeys.contains('prescriberName'))
              _field('Prescriber', 'prescriberName', _ex.prescriberName),
            _field('Appeal deadline', 'appealDeadline', _ex.appealDeadline,
                hint: 'YYYY-MM-DD if stated'),
            _field('Denial reason', 'denialReasonText', _ex.denialReasonText,
                maxLines: 4),
            ExpansionTile(
              tilePadding: EdgeInsets.zero,
              title: const Text('Review more extracted details (optional)',
                  style: TextStyle(fontWeight: FontWeight.w700)),
              subtitle: const Text(
                  'Patient, plan, dates, and amounts are saved for the packet.'),
              children: [
                _field('Plan type (if known)', 'planName', _ex.planName),
                _field('Member / patient name', 'patientName', _ex.patientName),
                if (!primaryKeys.contains('claimNumber'))
                  _field('Claim number', 'claimNumber', _ex.claimNumber),
                if (!primaryKeys.contains('priorAuthNumber'))
                  _field('Prior-auth number', 'priorAuthNumber',
                      _ex.priorAuthNumber),
                if (!primaryKeys.contains('providerName'))
                  _field('Provider', 'providerName', _ex.providerName),
                if (!primaryKeys.contains('prescriberName'))
                  _field('Prescriber', 'prescriberName', _ex.prescriberName),
                _field(
                    'Date received / denial date', 'denialDate', _ex.denialDate,
                    hint: 'YYYY-MM-DD'),
                _field('Amount billed', 'amountBilled',
                    _ex.amountBilled?.toStringAsFixed(2),
                    keyboard: TextInputType.number, prefix: '\$'),
                _field('Your responsibility', 'patientResponsibility',
                    _ex.patientResponsibility?.toStringAsFixed(2),
                    keyboard: TextInputType.number, prefix: '\$'),
              ],
            ),
            if (_ex.sourceSnippets.isNotEmpty) ...[
              const SizedBox(height: 8),
              _SnippetsPanel(snippets: _ex.sourceSnippets),
            ],
            const SizedBox(height: 24),
            if (_saveError != null) ...[
              Semantics(
                container: true,
                liveRegion: true,
                label: 'Error: $_saveError',
                child: ExcludeSemantics(
                  child: Text(
                    _saveError!,
                    style: const TextStyle(
                      color: AppColors.error,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 12),
            ],
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _saving ? null : _continue,
                icon: _saving
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.arrow_forward),
                label: Text(
                  _saving ? 'Saving details…' : 'Looks right — continue',
                ),
              ),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _field(
    String label,
    String key,
    String? value, {
    String? hint,
    int maxLines = 1,
    TextInputType? keyboard,
    String? prefix,
  }) {
    final needsAttention = (value == null || value.trim().isEmpty) ||
        _ex.missingFields
            .any((missing) => missing.toLowerCase() == key.toLowerCase()) ||
        !_ex.sourceSnippets
            .any((snippet) => snippet.field.toLowerCase() == key.toLowerCase());
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: TextField(
        controller: _ctrl(key, value),
        maxLines: maxLines,
        keyboardType: keyboard,
        decoration: InputDecoration(
          labelText: needsAttention ? '$label — please check' : label,
          hintText: hint ?? 'Unknown',
          prefixText: prefix,
          helperText: needsAttention
              ? 'Missing or not clearly supported by the uploaded document.'
              : null,
        ),
      ),
    );
  }
}

class _CategoryPicker extends StatelessWidget {
  const _CategoryPicker({
    required this.label,
    required this.value,
    required this.onChanged,
  });
  final String label;
  final DenialCategory value;
  final ValueChanged<DenialCategory> onChanged;

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<DenialCategory>(
      initialValue: value,
      isExpanded: true,
      decoration: InputDecoration(labelText: label),
      items: [
        for (final c in DenialCategory.values)
          DropdownMenuItem(
            value: c,
            child: Text(c.label, overflow: TextOverflow.ellipsis),
          ),
      ],
      onChanged: (v) => v != null ? onChanged(v) : null,
    );
  }
}

class _SnippetsPanel extends StatelessWidget {
  const _SnippetsPanel({required this.snippets});
  final List<SourceSnippet> snippets;

  @override
  Widget build(BuildContext context) {
    return ExpansionTile(
      tilePadding: EdgeInsets.zero,
      title: const Text('Where these came from',
          style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
      children: [
        for (final s in snippets)
          ListTile(
            dense: true,
            leading: const Icon(Icons.format_quote, size: 18),
            title: Text(s.field),
            subtitle: Text('"${s.snippet}"',
                style: const TextStyle(fontStyle: FontStyle.italic)),
          ),
      ],
    );
  }
}
