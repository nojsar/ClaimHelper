import 'dart:convert';

import 'package:claimhelper/models/packet.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('AppealPacket serialization', () {
    const packet = AppealPacket(
      plainEnglishSummary: 'Summary',
      appealStrategy: 'Strategy',
      appealLetter: 'Dear Appeals,',
      doctorLetterRequest: 'Dear Doctor,',
      evidenceChecklist: [
        EvidenceItem(
            item: 'Prescriber letter',
            whyNeeded: 'Rebuts denial',
            status: 'missing'),
      ],
      insurerCallScript: 'Hi, my name is...',
      deadlineChecklist: [
        DeadlineItem(
            task: 'File appeal', dueDate: '2026-08-17', priority: 'high'),
        DeadlineItem(task: 'Call insurer', dueDate: null, priority: 'medium'),
      ],
      warnings: ['Confirm your deadline.'],
      disclaimer: 'Not legal advice.',
    );

    test('round-trips through JSON', () {
      final restored = AppealPacket.fromJson(
          jsonDecode(jsonEncode(packet.toJson())) as Map<String, dynamic>);
      expect(restored.plainEnglishSummary, 'Summary');
      expect(restored.appealLetter, 'Dear Appeals,');
      expect(restored.evidenceChecklist.single.status, 'missing');
      expect(restored.deadlineChecklist.length, 2);
      expect(restored.deadlineChecklist[1].dueDate, isNull);
      expect(restored.warnings.single, 'Confirm your deadline.');
    });

    test('tolerates missing optional arrays', () {
      final restored = AppealPacket.fromJson({
        'plainEnglishSummary': 'S',
        'appealStrategy': 'St',
        'appealLetter': 'L',
        'doctorLetterRequest': 'D',
        'insurerCallScript': 'C',
        'disclaimer': 'X',
      });
      expect(restored.evidenceChecklist, isEmpty);
      expect(restored.deadlineChecklist, isEmpty);
      expect(restored.warnings, isEmpty);
    });

    test('FreePreview parses and keeps nullable amount', () {
      final preview = FreePreview.fromJson({
        'denialSummary': 'They denied it.',
        'amountAtStake': null,
        'likelyAppealPath': 'Internal appeal',
        'missingInfo': ['Doctor letter'],
        'recommendedPacketType': 'Step-therapy exception',
      });
      expect(preview.amountAtStake, isNull);
      expect(preview.missingInfo, contains('Doctor letter'));
      expect(preview.recommendedPacketType, 'Step-therapy exception');
    });
  });
}
