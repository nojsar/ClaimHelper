import 'package:flutter/services.dart' show rootBundle;
import 'package:intl/intl.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

import '../models/appeal_case.dart';

/// Builds and shares/prints the appeal packet PDF entirely on the client.
/// Cloud Functions produce structured JSON; rendering happens here so no
/// document content leaves the device for export.
class PdfService {
  Future<void> exportPacket(AppealCase appealCase) async {
    final doc = await buildPacketDocument(appealCase);
    final bytes = await doc.save();
    final safeId = appealCase.id.replaceAll(RegExp(r'[^A-Za-z0-9_-]'), '_');
    await Printing.sharePdf(
      bytes: bytes,
      filename: 'appeal_packet_$safeId.pdf',
    );
  }

  Future<pw.Document> buildPacketDocument(AppealCase appealCase) async {
    final packet = appealCase.packet!;
    final ex = appealCase.extraction;
    final doc = pw.Document(
      title: 'GetMyYes appeal packet',
      author: 'GetMyYes',
      creator: 'GetMyYes',
      subject: 'Appeal packet, submission tracker, and follow-up drafts',
    );
    final dateStr = DateFormat.yMMMMd().format(DateTime.now());

    // The built-in Helvetica has no Unicode support, and AI-drafted text
    // regularly contains characters outside its codepage (em dashes, curly
    // quotes, §, ≥ …) which makes doc.save() throw and the export "fail".
    // Noto Sans ships bundled in the app (assets/fonts/) — no runtime fetch
    // from Google, so export works offline and sends no visitor data out.
    pw.ThemeData? theme;
    try {
      Future<pw.Font> load(String file) async =>
          pw.Font.ttf(await rootBundle.load('assets/fonts/$file'));
      theme = pw.ThemeData.withFont(
        base: await load('NotoSans-Regular.ttf'),
        bold: await load('NotoSans-Bold.ttf'),
        italic: await load('NotoSans-Italic.ttf'),
        boldItalic: await load('NotoSans-BoldItalic.ttf'),
      );
    } catch (_) {
      theme = null;
    }

    pw.Widget heading(String text) => pw.Padding(
          padding: const pw.EdgeInsets.only(top: 16, bottom: 6),
          child: pw.Text(text,
              style:
                  pw.TextStyle(fontSize: 15, fontWeight: pw.FontWeight.bold)),
        );

    pw.Widget body(String text) => pw.Padding(
          padding: const pw.EdgeInsets.only(bottom: 6),
          child: pw.Text(text, style: const pw.TextStyle(fontSize: 11)),
        );

    pw.Widget subheading(String text) => pw.Padding(
          padding: const pw.EdgeInsets.only(top: 8, bottom: 4),
          child: pw.Text(
            text,
            style: pw.TextStyle(fontSize: 11, fontWeight: pw.FontWeight.bold),
          ),
        );

    final tracker = appealCase.caseTracker;
    final followUps = appealCase.followUps;

    doc.addPage(
      pw.MultiPage(
        pageTheme: pw.PageTheme(
          pageFormat: PdfPageFormat.letter,
          margin: const pw.EdgeInsets.all(40),
          theme: theme,
        ),
        footer: (context) => pw.Container(
          alignment: pw.Alignment.centerLeft,
          margin: const pw.EdgeInsets.only(top: 10),
          child: pw.Text(
            'GetMyYes draft — review before sending. Not medical, legal, or '
            'insurance advice.  •  Page ${context.pageNumber} of ${context.pagesCount}',
            style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey600),
          ),
        ),
        build: (context) => [
          pw.Text('Appeal Packet',
              style:
                  pw.TextStyle(fontSize: 24, fontWeight: pw.FontWeight.bold)),
          pw.Text('Prepared $dateStr',
              style:
                  const pw.TextStyle(fontSize: 10, color: PdfColors.grey700)),
          if (ex != null) ...[
            pw.SizedBox(height: 4),
            pw.Text(
              '${ex.deniedItem ?? 'Denied item'} — ${ex.insurerName ?? 'Insurer'}',
              style: const pw.TextStyle(fontSize: 11, color: PdfColors.grey800),
            ),
          ],
          pw.Divider(),
          heading('Plain-English summary'),
          body(packet.plainEnglishSummary),
          heading('Appeal strategy'),
          body(packet.appealStrategy),
          heading('Appeal letter'),
          pw.Container(
            width: double.infinity,
            padding: const pw.EdgeInsets.all(12),
            decoration: pw.BoxDecoration(
              border: pw.Border.all(color: PdfColors.grey400),
              borderRadius: pw.BorderRadius.circular(4),
            ),
            child: pw.Text(packet.appealLetter,
                style: const pw.TextStyle(fontSize: 11)),
          ),
          heading('Doctor letter request'),
          body(packet.doctorLetterRequest),
          heading('Evidence checklist'),
          pw.Table(
            border: pw.TableBorder.all(color: PdfColors.grey400),
            columnWidths: {
              0: const pw.FlexColumnWidth(3),
              1: const pw.FlexColumnWidth(4),
              2: const pw.FlexColumnWidth(1.4),
            },
            children: [
              _row(['Item', 'Why needed', 'Status'], header: true),
              ...packet.evidenceChecklist.map(
                (e) => _row([e.item, e.whyNeeded, e.status]),
              ),
            ],
          ),
          heading('Insurer call script'),
          body(packet.insurerCallScript),
          heading('Deadlines'),
          pw.Table(
            border: pw.TableBorder.all(color: PdfColors.grey400),
            columnWidths: {
              0: const pw.FlexColumnWidth(4),
              1: const pw.FlexColumnWidth(2),
              2: const pw.FlexColumnWidth(1.4),
            },
            children: [
              _row(['Task', 'Due date', 'Priority'], header: true),
              ...packet.deadlineChecklist.map(
                (d) => _row(
                    [d.task, d.dueDate ?? 'Confirm with insurer', d.priority]),
              ),
            ],
          ),
          heading('Submission tracker'),
          if (tracker == null)
            body('No appeal submission has been recorded for this case.')
          else
            pw.Table(
              border: pw.TableBorder.all(color: PdfColors.grey400),
              columnWidths: const {
                0: pw.FlexColumnWidth(2.2),
                1: pw.FlexColumnWidth(4),
              },
              children: [
                _row(['Field', 'Saved value'], header: true),
                _row(['Submitted date', _dateOnly(tracker.submittedDate)]),
                _row(['Submission method', tracker.submissionMethod.label]),
                _row([
                  'Confirmation or reference number',
                  _valueOrFallback(
                    tracker.confirmationNumber,
                    'Not provided',
                  ),
                ]),
                _row([
                  'Expected response date',
                  _optionalDate(tracker.expectedResponseDate),
                ]),
                _row([
                  'Response received date',
                  _optionalDate(tracker.responseDate),
                ]),
                _row(['Insurer status', tracker.responseStatus.label]),
                _row(['Current outcome', tracker.outcome.label]),
                _row([
                  'Email response reminder',
                  tracker.responseReminderEnabled ? 'Enabled' : 'Not enabled',
                ]),
              ],
            ),
          if (packet.warnings.isNotEmpty) ...[
            heading('Important warnings'),
            ...packet.warnings.map((w) => pw.Bullet(text: w)),
          ],
          if (followUps.isNotEmpty) ...[
            heading('Follow-up rounds'),
            for (var index = 0; index < followUps.length; index++) ...[
              pw.Container(
                width: double.infinity,
                margin: const pw.EdgeInsets.only(top: 8, bottom: 4),
                padding: const pw.EdgeInsets.all(10),
                decoration: pw.BoxDecoration(
                  border: pw.Border.all(color: PdfColors.grey400),
                  borderRadius: pw.BorderRadius.circular(4),
                  color: PdfColors.grey100,
                ),
                child: pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.start,
                  children: [
                    pw.Text(
                      'Round ${index + 1}: ${followUps[index].outcome}',
                      style: pw.TextStyle(
                        fontSize: 13,
                        fontWeight: pw.FontWeight.bold,
                      ),
                    ),
                    if (followUps[index].createdAt != null)
                      pw.Text(
                        'Created ${_dateOnly(followUps[index].createdAt!)}',
                        style: const pw.TextStyle(
                          fontSize: 9,
                          color: PdfColors.grey700,
                        ),
                      ),
                  ],
                ),
              ),
              subheading('Situation summary'),
              body(followUps[index].situationSummary),
              subheading('Recommended next steps'),
              body(followUps[index].recommendedNextSteps),
              subheading('Next response letter'),
              body(followUps[index].responseLetter),
              subheading('Updated call script'),
              body(followUps[index].callScript),
              if (_hasText(followUps[index].deadlineNotes)) ...[
                subheading('Deadline notes'),
                body(followUps[index].deadlineNotes!.trim()),
              ],
              if (followUps[index].warnings.isNotEmpty) ...[
                subheading('Follow-up warnings'),
                ...followUps[index]
                    .warnings
                    .map((warning) => pw.Bullet(text: warning)),
              ],
              pw.Padding(
                padding: const pw.EdgeInsets.only(top: 6, bottom: 10),
                child: pw.Text(
                  followUps[index].disclaimer,
                  style: const pw.TextStyle(
                    fontSize: 9,
                    fontStyle: pw.FontStyle.italic,
                    color: PdfColors.grey700,
                  ),
                ),
              ),
            ],
          ],
          pw.SizedBox(height: 16),
          pw.Container(
            padding: const pw.EdgeInsets.all(10),
            color: PdfColors.grey200,
            child: pw.Text(packet.disclaimer,
                style: const pw.TextStyle(
                    fontSize: 9, fontStyle: pw.FontStyle.italic)),
          ),
        ],
      ),
    );
    return doc;
  }

  static bool _hasText(String? value) =>
      value != null && value.trim().isNotEmpty;

  static String _valueOrFallback(String? value, String fallback) =>
      _hasText(value) ? value!.trim() : fallback;

  static String _optionalDate(DateTime? date) =>
      date == null ? 'Not provided' : _dateOnly(date);

  static String _dateOnly(DateTime date) =>
      '${date.year.toString().padLeft(4, '0')}-'
      '${date.month.toString().padLeft(2, '0')}-'
      '${date.day.toString().padLeft(2, '0')}';

  pw.TableRow _row(List<String> cells, {bool header = false}) => pw.TableRow(
        decoration:
            header ? const pw.BoxDecoration(color: PdfColors.grey300) : null,
        children: cells
            .map((c) => pw.Padding(
                  padding: const pw.EdgeInsets.all(6),
                  child: pw.Text(c,
                      style: pw.TextStyle(
                        fontSize: 10,
                        fontWeight:
                            header ? pw.FontWeight.bold : pw.FontWeight.normal,
                      )),
                ))
            .toList(),
      );
}
