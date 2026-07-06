import 'extraction.dart';
import 'guided_answers.dart';
import 'packet.dart';

enum CaseStatus {
  uploaded('uploaded'),
  extracted('extracted'),
  preview('preview'),
  paid('paid'),
  generated('generated'),
  error('error');

  const CaseStatus(this.wire);
  final String wire;

  static CaseStatus fromWire(String? v) => CaseStatus.values
      .firstWhere((e) => e.wire == v, orElse: () => CaseStatus.uploaded);
}

/// Client-side view of a `cases/{caseId}` document.
class AppealCase {
  const AppealCase({
    required this.id,
    this.ownerUid,
    required this.status,
    this.createdAt,
    this.updatedAt,
    this.expiresAt,
    this.saved = false,
    this.sourceFilePaths = const [],
    this.extraction,
    this.guidedAnswers,
    this.preview,
    this.packet,
    this.paid = false,
    this.pricePaid,
    this.lastError,
    this.generationProgress,
    this.generationStage,
  });

  final String id;
  final String? ownerUid;
  final CaseStatus status;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final DateTime? expiresAt;
  final bool saved;
  final List<String> sourceFilePaths;
  final DenialExtraction? extraction;
  final GuidedAnswers? guidedAnswers;
  final FreePreview? preview;
  final AppealPacket? packet;
  final bool paid;
  final double? pricePaid;
  final String? lastError;

  /// Server-reported packet-generation progress (0..1) and stage label,
  /// written by the generateAppealPacket function while the model runs.
  final double? generationProgress;
  final String? generationStage;

  factory AppealCase.fromJson(String id, Map<String, dynamic> json) {
    final generation = json['generation'];
    return AppealCase(
      id: id,
      ownerUid: json['ownerUid'] as String?,
      status: CaseStatus.fromWire(json['status'] as String?),
      createdAt: _toDate(json['createdAt']),
      updatedAt: _toDate(json['updatedAt']),
      expiresAt: _toDate(json['expiresAt']),
      saved: json['saved'] as bool? ?? false,
      sourceFilePaths: (json['sourceFilePaths'] as List<dynamic>? ?? [])
          .whereType<String>()
          .toList(),
      extraction: json['extraction'] is Map<String, dynamic>
          ? DenialExtraction.fromJson(json['extraction'] as Map<String, dynamic>)
          : null,
      guidedAnswers: json['guidedAnswers'] is Map<String, dynamic>
          ? GuidedAnswers.fromJson(json['guidedAnswers'] as Map<String, dynamic>)
          : null,
      preview: json['preview'] is Map<String, dynamic>
          ? FreePreview.fromJson(json['preview'] as Map<String, dynamic>)
          : null,
      packet: json['packet'] is Map<String, dynamic>
          ? AppealPacket.fromJson(json['packet'] as Map<String, dynamic>)
          : null,
      paid: json['paid'] as bool? ?? false,
      pricePaid: (json['pricePaid'] as num?)?.toDouble(),
      lastError: json['lastError'] as String?,
      generationProgress: generation is Map
          ? (generation['progress'] as num?)?.toDouble()
          : null,
      generationStage:
          generation is Map ? generation['stage'] as String? : null,
    );
  }

  /// Firestore Timestamps arrive as objects exposing toDate(); mocks use
  /// ISO strings. Accept both without importing cloud_firestore here so the
  /// model stays pure-Dart testable.
  static DateTime? _toDate(dynamic v) {
    if (v == null) return null;
    if (v is DateTime) return v;
    if (v is String) return DateTime.tryParse(v);
    try {
      return (v as dynamic).toDate() as DateTime;
    } catch (_) {
      return null;
    }
  }

  AppealCase copyWith({
    CaseStatus? status,
    List<String>? sourceFilePaths,
    DenialExtraction? extraction,
    GuidedAnswers? guidedAnswers,
    FreePreview? preview,
    AppealPacket? packet,
    bool? paid,
    bool? saved,
    double? pricePaid,
    String? lastError,
  }) {
    return AppealCase(
      id: id,
      ownerUid: ownerUid,
      status: status ?? this.status,
      createdAt: createdAt,
      updatedAt: DateTime.now(),
      expiresAt: expiresAt,
      saved: saved ?? this.saved,
      sourceFilePaths: sourceFilePaths ?? this.sourceFilePaths,
      extraction: extraction ?? this.extraction,
      guidedAnswers: guidedAnswers ?? this.guidedAnswers,
      preview: preview ?? this.preview,
      packet: packet ?? this.packet,
      paid: paid ?? this.paid,
      pricePaid: pricePaid ?? this.pricePaid,
      lastError: lastError ?? this.lastError,
    );
  }
}

/// Paywall entitlement rules, kept as pure functions so they are trivially
/// testable and identical reasoning can be mirrored server-side.
abstract final class Entitlement {
  /// The full packet UI unlocks only when the backend marked the case paid.
  static bool canViewFullPacket(AppealCase c) => c.paid;

  /// Packet generation may be requested once paid, extraction exists, and
  /// guided answers pass validation.
  static bool canGeneratePacket(AppealCase c) =>
      c.paid && c.extraction != null && (c.guidedAnswers?.isComplete ?? false);

  /// Free preview requires extraction only.
  static bool canGeneratePreview(AppealCase c) => c.extraction != null;

  /// Checkout is offered when there is something to buy and it isn't bought.
  static bool canPurchase(AppealCase c) => !c.paid && c.extraction != null;
}
