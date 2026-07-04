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

class _GuidedQuestionsScreenState
    extends ConsumerState<GuidedQuestionsScreen> {
  late GuidedAnswers _a;
  final _urgencyCtrl = TextEditingController();
  final _contactCtrl = TextEditingController();
  bool _showErrors = false;

  @override
  void initState() {
    super.initState();
    _a = ref.read(intakeControllerProvider).guidedAnswers;
    _urgencyCtrl.text = _a.urgencyNote ?? '';
    _contactCtrl.text = _a.contactNotes ?? '';
  }

  @override
  void dispose() {
    _urgencyCtrl.dispose();
    _contactCtrl.dispose();
    super.dispose();
  }

  void _set(GuidedAnswers next) => setState(() => _a = next);

  Future<void> _continue() async {
    final collected = _a.copyWith(
      urgencyNote: _urgencyCtrl.text.trim(),
      contactNotes: _contactCtrl.text.trim(),
    );
    final problems = collected.validate();
    if (problems.isNotEmpty) {
      setState(() {
        _a = collected;
        _showErrors = true;
      });
      return;
    }
    final ctrl = ref.read(intakeControllerProvider.notifier);
    ctrl.updateGuidedAnswers(collected);
    await ctrl.persistGuidedAnswers();
    if (mounted) context.go('/case/${widget.caseId}/preview');
  }

  @override
  Widget build(BuildContext context) {
    final problems = _showErrors ? _a.validate() : const <String>[];

    return AppScaffold(
      title: 'A few questions',
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Tailor your appeal',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            const Text(
              'These answers make your appeal specific to your situation. '
              'We never invent facts — only what you tell us is used.',
              style: TextStyle(color: AppColors.textSecondary),
            ),
            const SizedBox(height: 20),

            _Q('Who is this denial for?'),
            _ChipGroup<PatientRelation>(
              options: PatientRelation.values,
              selected: _a.relation,
              label: (v) => v.label,
              onSelect: (v) => _set(_a.copyWith(relation: v)),
            ),

            _Q('What state do you live in?'),
            DropdownButtonFormField<String>(
              initialValue: _a.usState,
              decoration: const InputDecoration(labelText: 'State'),
              items: [
                for (final s in UsStates.all)
                  DropdownMenuItem(value: s, child: Text(s)),
              ],
              onChanged: (v) => _set(_a.copyWith(usState: v)),
            ),

            _Q('What kind of insurance is this?'),
            _ChipGroup<InsuranceType>(
              options: InsuranceType.values,
              selected: _a.insuranceType,
              label: (v) => v.label,
              onSelect: (v) => _set(_a.copyWith(insuranceType: v)),
            ),

            _Q('What outcome do you want?'),
            _ChipGroup<DesiredOutcome>(
              options: DesiredOutcome.values,
              selected: _a.desiredOutcome,
              label: (v) => v.label,
              onSelect: (v) => _set(_a.copyWith(desiredOutcome: v)),
            ),

            _Q('Is a delay urgent or harmful to health, function, or recovery?'),
            _YesNo(
              value: _a.isUrgent,
              onChanged: (v) => _set(_a.copyWith(isUrgent: v)),
            ),
            if (_a.isUrgent == true)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: TextField(
                  controller: _urgencyCtrl,
                  maxLines: 2,
                  decoration: const InputDecoration(
                    labelText: 'Briefly, why is a delay harmful?',
                  ),
                ),
              ),

            _Q('Have you tried required alternatives?'),
            const Text(
              'For medication denials, list drugs or treatments already tried, '
              'failed, contraindicated, or not tolerated.',
              style: TextStyle(fontSize: 12.5, color: AppColors.textSecondary),
            ),
            const SizedBox(height: 8),
            _AlternativesEditor(
              items: _a.triedAlternatives,
              onChanged: (list) => _set(_a.copyWith(triedAlternatives: list)),
            ),

            _Q('Which supporting documents do you have?'),
            _MultiChipGroup<SupportingDocument>(
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
              value: _a.contactedInsurer,
              onChanged: (v) => _set(_a.copyWith(contactedInsurer: v)),
            ),
            if (_a.contactedInsurer == true)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: TextField(
                  controller: _contactCtrl,
                  maxLines: 3,
                  decoration: const InputDecoration(
                    labelText: 'Call dates, who you spoke with, reference numbers',
                  ),
                ),
              ),

            if (problems.isNotEmpty) ...[
              const SizedBox(height: 16),
              _ProblemList(problems: problems),
            ],
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _continue,
                icon: const Icon(Icons.arrow_forward),
                label: const Text('See my free preview'),
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
        child: Text(text,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
      );
}

class _ChipGroup<T> extends StatelessWidget {
  const _ChipGroup({
    required this.options,
    required this.selected,
    required this.label,
    required this.onSelect,
  });
  final List<T> options;
  final T? selected;
  final String Function(T) label;
  final ValueChanged<T> onSelect;

  @override
  Widget build(BuildContext context) {
    return Wrap(
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
    );
  }
}

class _MultiChipGroup<T> extends StatelessWidget {
  const _MultiChipGroup({
    required this.options,
    required this.selected,
    required this.label,
    required this.onToggle,
  });
  final List<T> options;
  final Set<T> selected;
  final String Function(T) label;
  final ValueChanged<T> onToggle;

  @override
  Widget build(BuildContext context) {
    return Wrap(
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
    );
  }
}

class _YesNo extends StatelessWidget {
  const _YesNo({required this.value, required this.onChanged});
  final bool? value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        ChoiceChip(
          label: const Text('Yes'),
          selected: value == true,
          onSelected: (_) => onChanged(true),
        ),
        const SizedBox(width: 8),
        ChoiceChip(
          label: const Text('No'),
          selected: value == false,
          onSelected: (_) => onChanged(false),
        ),
      ],
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
            child: Row(
              children: [
                Expanded(
                  flex: 3,
                  child: TextFormField(
                    initialValue: items[i].name,
                    decoration: const InputDecoration(
                        labelText: 'Drug / treatment', isDense: true),
                    onChanged: (v) {
                      final next = [...items];
                      next[i] = TriedAlternative(name: v, outcome: items[i].outcome);
                      onChanged(next);
                    },
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  flex: 2,
                  child: DropdownButtonFormField<String>(
                    initialValue: items[i].outcome,
                    isDense: true,
                    decoration: const InputDecoration(isDense: true),
                    items: [
                      for (final e in _outcomes.entries)
                        DropdownMenuItem(
                            value: e.key,
                            child: Text(e.value,
                                style: const TextStyle(fontSize: 12))),
                    ],
                    onChanged: (v) {
                      final next = [...items];
                      next[i] =
                          TriedAlternative(name: items[i].name, outcome: v ?? 'other');
                      onChanged(next);
                    },
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.remove_circle_outline),
                  onPressed: () {
                    final next = [...items]..removeAt(i);
                    onChanged(next);
                  },
                ),
              ],
            ),
          ),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () => onChanged(
                [...items, const TriedAlternative(name: '', outcome: 'failed')]),
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
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFFEF2F2),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFFFECACA)),
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
    );
  }
}
