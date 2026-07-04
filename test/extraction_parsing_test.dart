import 'dart:convert';

import 'package:claimhelper/models/extraction.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('DenialExtraction JSON parsing', () {
    test('parses a full extraction payload from the OpenAI schema', () {
      const raw = '''
      {
        "documentType": "prior_authorization",
        "denialCategory": "step_therapy",
        "insurerName": "Sample Health Plan",
        "planName": "Employer PPO",
        "patientName": "Jordan Sample",
        "memberIdLast4": "4821",
        "claimNumber": "CLM-1",
        "priorAuthNumber": "PA-77219",
        "dateOfService": "2026-06-10",
        "denialDate": "2026-06-18",
        "appealDeadline": "2026-08-17",
        "deniedItem": "Wegovy 2.4 mg",
        "providerName": "Riverbend Family Medicine",
        "prescriberName": "Dr. A. Chen",
        "denialReasonText": "Requires step therapy.",
        "amountBilled": 1349.0,
        "patientResponsibility": 1349.0,
        "appealInstructions": "Appeal within 60 days.",
        "phoneNumbers": ["1-800-555-0134"],
        "mailingAddresses": ["PO Box 1000"],
        "missingFields": ["dateOfBirth"],
        "sourceSnippets": [
          {"field": "denialReasonText", "snippet": "step therapy"}
        ]
      }
      ''';
      final ex =
          DenialExtraction.fromJson(jsonDecode(raw) as Map<String, dynamic>);

      expect(ex.documentType, DocumentType.priorAuthorization);
      expect(ex.denialCategory, DenialCategory.stepTherapy);
      expect(ex.insurerName, 'Sample Health Plan');
      expect(ex.amountBilled, 1349.0);
      expect(ex.phoneNumbers, ['1-800-555-0134']);
      expect(ex.missingFields, contains('dateOfBirth'));
      expect(ex.sourceSnippets.single.snippet, 'step therapy');
    });

    test('treats nulls as unknown without throwing', () {
      const raw = '''
      {
        "documentType": "unknown",
        "denialCategory": "unknown",
        "insurerName": null,
        "planName": null,
        "patientName": null,
        "memberIdLast4": null,
        "claimNumber": null,
        "priorAuthNumber": null,
        "dateOfService": null,
        "denialDate": null,
        "appealDeadline": null,
        "deniedItem": null,
        "providerName": null,
        "prescriberName": null,
        "denialReasonText": null,
        "amountBilled": null,
        "patientResponsibility": null,
        "appealInstructions": null,
        "phoneNumbers": [],
        "mailingAddresses": [],
        "missingFields": [],
        "sourceSnippets": []
      }
      ''';
      final ex =
          DenialExtraction.fromJson(jsonDecode(raw) as Map<String, dynamic>);

      expect(ex.insurerName, isNull);
      expect(ex.amountBilled, isNull);
      expect(ex.phoneNumbers, isEmpty);
      expect(ex.documentType, DocumentType.unknown);
    });

    test('unknown enum values fall back to unknown', () {
      final ex = DenialExtraction.fromJson({
        'documentType': 'nonsense_value',
        'denialCategory': 'also_nonsense',
        'phoneNumbers': <String>[],
        'mailingAddresses': <String>[],
        'missingFields': <String>[],
        'sourceSnippets': <dynamic>[],
      });
      expect(ex.documentType, DocumentType.unknown);
      expect(ex.denialCategory, DenialCategory.unknown);
    });

    test('round-trips through toJson without losing data', () {
      const ex = DenialExtraction(
        documentType: DocumentType.eob,
        denialCategory: DenialCategory.medication,
        insurerName: 'Acme',
        deniedItem: 'Adderall XR',
        amountBilled: 200.5,
      );
      final restored = DenialExtraction.fromJson(ex.toJson());
      expect(restored.insurerName, 'Acme');
      expect(restored.deniedItem, 'Adderall XR');
      expect(restored.amountBilled, 200.5);
      expect(restored.denialCategory, DenialCategory.medication);
    });
  });
}
