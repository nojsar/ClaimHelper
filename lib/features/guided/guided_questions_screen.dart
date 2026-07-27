import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/constants.dart';
import '../../core/theme.dart';
import '../../models/guided_answers.dart';
import '../../state/intake_controller.dart';
import '../../widgets/app_scaffold.dart';

/// Guided intake. Tailors the appeal: who it's for, state, insurance type,
/// desired outcome, urgency, alternatives tried, documents on hand, and prior
/// contact with the insurer.
class GuidedQuestionsScreen extends ConsumerStatefulWidget {
  const GuidedQuestionsScreen({super.key, required this.caseId});
  final String caseId;

  @override
  ConsumerState<GuidedQuestionsScreen> createState() =>
      _GuidedQuestionsScreenState();
}

class _GuidedQuestionsScreenState extends ConsumerState<GuidedQuestionsScreen> {
  GuidedAnswers _a = const GuidedAnswers();
  PreviewQuestionPlan? _plan;
  late final IntakeController _controller;
  final _urgencyCtrl = TextEditingController();
  final _contactCtrl = TextEditingController();
  Timer? _saveDebounce;
  bool _showErrors = false;
  bool _initialized = false;
  bool _saving = false;
  bool _saved = false;
  bool _continuing = false;
  String? _loadError;
  String? _saveError;

  @override
  void initState() {
    super.initState();
    _controller = ref.read(intakeControllerProvider.notifier);
    final intake = ref.read(intakeControllerProvider);
    if (intake.caseId == widget.caseId && intake.extraction != null) {
      _initialize(intake);
    } else {
      WidgetsBinding.instance.addPostFrameCallback((_) => _restore());
    }
  }

  void _initialize(IntakeState intake) {
    final extraction = intake.extraction;
    if (extraction == null) return;
    _a = intake.guidedAnswers;
    _plan = PreviewQuestionPlan.fromExtraction(extraction);
    _urgencyCtrl.text = _a.urgencyNote ?? '';
    _contactCtrl.text = _a.contactNotes ?? '';
    _initialized = true;
  }

  Future<void> _restore() async {
    if (mounted) setState(() => _loadError = null);
    try {
      await _controller.restoreCase(widget.caseId);
      final intake = ref.read(intakeControllerProvider);
      if (intake.extraction == null) {
        throw StateError('Extraction is not ready.');
      }
      if (!mounted) return;
      setState(() => _initialize(intake));
    } catch (_) {
      if (mounted) {
        setState(() => _loadError =
            'We could not restore your saved answers. Please retry.');
      }
    }
  }

  @override
  void dispose() {
    _saveDebounce?.cancel();
    if (_initialized) {
      _controller.updateGuidedAnswers(_collected);
      unawaited(
        _controller.persistGuidedAnswers().catchError((Object _) {}),
      );
    }
    _urgencyCtrl.dispose();
    _contactCtrl.dispose();
    super.dispose();
  }

  GuidedAnswers get _collected => _a.copyWith(
        urgencyNote: _urgencyCtrl.text.trim(),
        contactNotes: _contactCtrl.text.trim(),
      );

  void _set(GuidedAnswers next) {
    setState(() {
      _a = next;
      _saved = false;
      _saveError = null;
    });
    _scheduleAutosave();
  }

  void _scheduleAutosave() {
    _controller.updateGuidedAnswers(_collected);
    _saveDebounce?.cancel();
    _saveDebounce = Timer(
      const Duration(milliseconds: 650),
      () => unawaited(_autosaveNow()),
    );
  }

  Future<void> _autosaveNow() async {
    await _saveNow();
  }

  Future<bool> _saveNow() async {
    _saveDebounce?.cancel();
    _controller.updateGuidedAnswers(_collected);
    if (mounted) {
      setState(() {
        _saving = true;
        _saveError = null;
      });
    }
    try {
      await _controller.persistGuidedAnswers();
      if (mounted) {
        setState(() {
          _saving = false;
          _saved = true;
        });
      }
      return true;
    } catch (_) {
      if (mounted) {
        setState(() {
          _saving = false;
          _saved = false;
          _saveError =
              'Your latest answers are still on this page. Reconnect and try '
              'again to sync them.';
        });
      }
      return false;
    }
  }

  Future<void> _continue() async {
    if (_continuing) return;
    final collected = _collected;
    final problems = _plan!.validate(collected);
    if (problems.isNotEmpty) {
      setState(() {
        _a = collected;
        _showErrors = true;
      });
      return;
    }
    setState(() {
      _a = collected;
      _continuing = true;
    });
    _controller.updateGuidedAnswers(collected);
    final saved = await _saveNow();
    if (!mounted) return;
    setState(() => _continuing = false);
    if (saved) context.go('/case/${widget.caseId}/preview');
  }

  @override
  Widget build(BuildContext context) {
    if (!_initialized || _plan == null) {
      return AppScaffold(
        title: 'A few questions',
        child: _loadError == null
            ? const Center(child: CircularProgressIndicator())
            : ErrorRetry(message: _loadError!, onRetry: _restore),
      );
    }

    final plan = _plan!;
    final problems = _showErrors ? plan.validate(_collected) : const <String>[];
    final saveStatus =
        _saving ? 'Saving…' : (_saveError ?? (_saved ? 'Answers saved' : ''));

    return AppScaffold(
      title: 'A few questions',
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Semantics(
              header: true,
              child: Text('Tailor your appeal',
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
            ),
            const SizedBox(height: 6),
            const Text(
              'We only ask what the document could not tell us and what '
              'materially improves your preview. Optional packet details can '
              'be added below.',
              style: TextStyle(color: AppColors.textSecondary),
            ),
            const SizedBox(height: 8),
            Semantics(
              liveRegion: true,
              label: saveStatus,
              excludeSemantics: true,
              child: Text(
                saveStatus,
                style: TextStyle(
                  fontSize: 12,
                  color: _saveError == null
                      ? AppColors.textMuted
                      : AppColors.warning,
                ),
              ),
            ),
            const SizedBox(height: 20),
            if (plan.askRelation) ...[
              _Q('Who is this denial for?'),
              _ChipGroup<PatientRelation>(
                groupLabel: 'Who is this denial for?',
                options: PatientRelation.values,
                selected: _a.relation,
                label: (v) => v.label,
                onSelect: (v) => _set(_a.copyWith(relation: v)),
              ),
            ],
            _Q('What state do you live in?'),
            DropdownButtonFormField<String>(
              initialValue: _a.usState,
              decoration: InputDecoration(
                labelText: 'State',
                errorText: _showErrors && _a.usState == null
                    ? 'Select your state.'
                    : null,
              ),
              items: [
                for (final s in UsStates.all)
                  DropdownMenuItem(value: s, child: Text(s)),
              ],
              onChanged: (v) => _set(_a.copyWith(usState: v)),
            ),
            if (plan.askInsuranceType) ...[
              _Q('What kind of insurance is this?'),
              _ChipGroup<InsuranceType>(
                groupLabel: 'Insurance type',
                options: InsuranceType.values,
                selected: _a.insuranceType,
                label: (v) => v.label,
                onSelect: (v) => _set(_a.copyWith(insuranceType: v)),
              ),
            ],
            _Q('What outcome do you want?'),
            _ChipGroup<DesiredOutcome>(
              groupLabel: 'Desired outcome',
              options: DesiredOutcome.values,
              selected: _a.desiredOutcome,
              label: (v) => v.label,
              onSelect: (v) => _set(_a.copyWith(desiredOutcome: v)),
            ),
            if (plan.askUrgency) ...[
              _Q('Is a delay urgent or harmful to health, function, or recovery?'),
              _YesNo(
                groupLabel: 'Whether a delay is urgent or harmful',
                value: _a.isUrgent,
                onChanged: (v) => _set(_a.copyWith(isUrgent: v)),
              ),
            ],
            if (plan.askUrgency && _a.isUrgent == true)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: TextField(
                  controller: _urgencyCtrl,
                  maxLines: 2,
                  onChanged: (_) {
                    if (_showErrors) setState(() {});
                    _scheduleAutosave();
                  },
                  decoration: InputDecoration(
                    labelText: 'Briefly, why is a delay harmful?',
                    errorText: _showErrors && _urgencyCtrl.text.trim().isEmpty
                        ? 'Describe why a delay is harmful.'
                        : null,
                  ),
                ),
              ),
            if (plan.askAlternatives) ...[
              _Q('Have you tried required alternatives?'),
              const Text(
                'If applicable, add drugs or treatments that failed, were not '
                'tolerated, or were not safe for you. Leave this blank if none.',
                style:
                    TextStyle(fontSize: 12.5, color: AppColors.textSecondary),
              ),
              const SizedBox(height: 8),
              _AlternativesEditor(
                items: _a.triedAlternatives,
                onChanged: (list) => _set(_a.copyWith(triedAlternatives: list)),
              ),
            ],
            const SizedBox(height: 12),
            ExpansionTile(
              tilePadding: EdgeInsets.zero,
              title: const Text('Add more packet detail (optional)',
                  style: TextStyle(fontWeight: FontWeight.w700)),
              subtitle: const Text(
                  'Documents and insurer-call notes can strengthen the full packet.'),
              children: [
                if (!plan.askRelation) ...[
                  _Q('Who is this denial for?'),
                  _ChipGroup<PatientRelation>(
                    groupLabel: 'Who is this denial for?',
                    options: PatientRelation.values,
                    selected: _a.relation,
                    label: (v) => v.label,
                    onSelect: (v) => _set(_a.copyWith(relation: v)),
                  ),
                ],
                if (!plan.askInsuranceType) ...[
                  _Q('What kind of insurance is this?'),
                  _ChipGroup<InsuranceType>(
                    groupLabel: 'Insurance type',
                    options: InsuranceType.values,
                    selected: _a.insuranceType,
                    label: (v) => v.label,
                    onSelect: (v) => _set(_a.copyWith(insuranceType: v)),
                  ),
                ],
                _Q('Which supporting documents do you have?'),
                _MultiChipGroup<SupportingDocument>(
                  groupLabel: 'Supporting documents on hand',
                  options: SupportingDocument.values,
                  selected: _a.documentsOnHand,
                  label: (v) => v.label,
                  onToggle: (v) {
                    final next = {..._a.documentsOnHand};
                    next.contains(v) ? next.remove(v) : next.add(v);
                    _set(_a.copyWith(documentsOnHand: next));
                  },
                ),
                _Q('Have you already called the insurer or provider?'),
                _YesNo(
                  groupLabel: 'Whether you contacted the insurer or provider',
                  value: _a.contactedInsurer,
                  onChanged: (v) => _set(_a.copyWith(contactedInsurer: v)),
                ),
                if (_a.contactedInsurer == true)
                  Padding(
                    padding: const EdgeInsets.only(top: 8, bottom: 12),
                    child: TextField(
                      controller: _contactCtrl,
                      maxLines: 3,
                      onChanged: (_) => _scheduleAutosave(),
                      decoration: const InputDecoration(
                        labelText:
                            'Call dates, who you spoke with, reference numbers',
                      ),
                    ),
                  ),
              ],
            ),
            if (problems.isNotEmpty) ...[
              const SizedBox(height: 16),
              _ProblemList(problems: problems),
            ],
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _continuing ? null : _continue,
                icon: _continuing
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.arrow_forward),
                label: Text(
                  _continuing ? 'Syncing answers…' : 'See my free preview',
                ),
              ),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}

class _Q extends StatelessWidget {
  const _Q(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 22, bottom: 10),
        child: Semantics(
          header: true,
          child: Text(text,
              style:
                  const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
        ),
      );
}

class _ChipGroup<T> extends StatelessWidget {
  const _ChipGroup({
    required this.groupLabel,
    required this.options,
    required this.selected,
    required this.label,
    required this.onSelect,
  });
  final String groupLabel;
  final List<T> options;
  final T? selected;
  final String Function(T) label;
  final ValueChanged<T> onSelect;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      container: true,
      label: groupLabel,
      explicitChildNodes: true,
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final o in options)
            ChoiceChip(
              label: Text(label(o)),
              selected: selected == o,
              onSelected: (_) => onSelect(o),
            ),
        ],
      ),
    );
  }
}

class _MultiChipGroup<T> extends StatelessWidget {
  const _MultiChipGroup({
    required this.groupLabel,
    required this.options,
    required this.selected,
    required this.label,
    required this.onToggle,
  });
  final String groupLabel;
  final List<T> options;
  final Set<T> selected;
  final String Function(T) label;
  final ValueChanged<T> onToggle;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      container: true,
      label: groupLabel,
      explicitChildNodes: true,
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final o in options)
            FilterChip(
              label: Text(label(o)),
              selected: selected.contains(o),
              onSelected: (_) => onToggle(o),
            ),
        ],
      ),
    );
  }
}

class _YesNo extends StatelessWidget {
  const _YesNo({
    required this.groupLabel,
    required this.value,
    required this.onChanged,
  });
  final String groupLabel;
  final bool? value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      container: true,
      label: groupLabel,
      explicitChildNodes: true,
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          ChoiceChip(
            label: const Text('Yes'),
            selected: value == true,
            onSelected: (_) => onChanged(true),
          ),
          ChoiceChip(
            label: const Text('No'),
            selected: value == false,
            onSelected: (_) => onChanged(false),
          ),
        ],
      ),
    );
  }
}

class _AlternativesEditor extends StatelessWidget {
  const _AlternativesEditor({required this.items, required this.onChanged});
  final List<TriedAlternative> items;
  final ValueChanged<List<TriedAlternative>> onChanged;

  static const _outcomes = {
    'failed': 'Tried, didn\'t work',
    'not_tolerated': 'Couldn\'t tolerate',
    'contraindicated': 'Not safe for me',
    'other': 'Other',
  };

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        for (var i = 0; i < items.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: LayoutBuilder(
              builder: (context, constraints) {
                final name = TextFormField(
                  initialValue: items[i].name,
                  decoration: InputDecoration(
                      labelText: 'Alternative ${i + 1}: drug or treatment',
                      isDense: true),
                  onChanged: (v) {
                    final next = [...items];
                    next[i] =
                        TriedAlternative(name: v, outcome: items[i].outcome);
                    onChanged(next);
                  },
                );
                final outcome = DropdownButtonFormField<String>(
                  initialValue: items[i].outcome,
                  isExpanded: true,
                  isDense: true,
                  decoration: InputDecoration(
                      labelText: 'Alternative ${i + 1}: result', isDense: true),
                  items: [
                    for (final e in _outcomes.entries)
                      DropdownMenuItem(value: e.key, child: Text(e.value)),
                  ],
                  onChanged: (v) {
                    final next = [...items];
                    next[i] = TriedAlternative(
                        name: items[i].name, outcome: v ?? 'other');
                    onChanged(next);
                  },
                );
                final remove = IconButton(
                  tooltip: items[i].name.trim().isEmpty
                      ? 'Remove alternative ${i + 1}'
                      : 'Remove ${items[i].name}',
                  icon: const Icon(Icons.remove_circle_outline),
                  onPressed: () {
                    final next = [...items]..removeAt(i);
                    onChanged(next);
                  },
                );
                if (constraints.maxWidth < 520) {
                  return Column(
                    children: [
                      name,
                      const SizedBox(height: 8),
                      Row(children: [Expanded(child: outcome), remove]),
                    ],
                  );
                }
                return Row(
                  children: [
                    Expanded(flex: 3, child: name),
                    const SizedBox(width: 8),
                    Expanded(flex: 2, child: outcome),
                    remove,
                  ],
                );
              },
            ),
          ),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () => onChanged([
              ...items,
              const TriedAlternative(name: '', outcome: 'failed')
            ]),
            icon: const Icon(Icons.add),
            label: const Text('Add an alternative'),
          ),
        ),
      ],
    );
  }
}

class _ProblemList extends StatelessWidget {
  const _ProblemList({required this.problems});
  final List<String> problems;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      container: true,
      liveRegion: true,
      label: 'Please fix ${problems.length} form '
          '${problems.length == 1 ? 'error' : 'errors'}',
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.errorTint,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: AppColors.error.withValues(alpha: 0.35)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final p in problems)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.error_outline,
                        size: 16, color: AppColors.error),
                    const SizedBox(width: 8),
                    Expanded(
                        child: Text(p,
                            style: const TextStyle(
                                fontSize: 13, color: AppColors.error))),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
