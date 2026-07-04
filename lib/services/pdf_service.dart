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
    await Printing.sharePdf(
      bytes: bytes,
      filename: 'appeal_packet_${appealCase.id}.pdf',
    );
  }

  Future<pw.Document> buildPacketDocument(AppealCase appealCase) async {
    final packet = appealCase.packet!;
    final ex = appealCase.extraction;
    final doc = pw.Document();
    final dateStr = DateFormat.yMMMMd().format(DateTime.now());

    pw.Widget heading(String text) => pw.Padding(
          padding: const pw.EdgeInsets.only(top: 16, bottom: 6),
          child: pw.Text(text,
              style: pw.TextStyle(
                  fontSize: 15, fontWeight: pw.FontWeight.bold)),
        );

    pw.Widget body(String text) => pw.Padding(
          padding: const pw.EdgeInsets.only(bottom: 6),
          child: pw.Text(text, style: const pw.TextStyle(fontSize: 11)),
        );

    doc.addPage(
      pw.MultiPage(
        pageTheme: pw.PageTheme(
          pageFormat: PdfPageFormat.letter,
          margin: const pw.EdgeInsets.all(40),
        ),
        footer: (context) => pw.Container(
          alignment: pw.Alignment.centerLeft,
          margin: const pw.EdgeInsets.only(top: 10),
          child: pw.Text(
            'ClaimHelper draft — review before sending. Not medical, legal, or '
            'insurance advice.  •  Page ${context.pageNumber} of ${context.pagesCount}',
            style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey600),
          ),
        ),
        build: (context) => [
          pw.Text('Appeal Packet',
              style: pw.TextStyle(
                  fontSize: 24, fontWeight: pw.FontWeight.bold)),
          pw.Text('Prepared $dateStr',
              style: const pw.TextStyle(fontSize: 10, color: PdfColors.grey700)),
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
                (d) => _row([d.task, d.dueDate ?? 'Confirm with insurer', d.priority]),
              ),
            ],
          ),

          if (packet.warnings.isNotEmpty) ...[
            heading('Important warnings'),
            ...packet.warnings.map((w) => pw.Bullet(text: w)),
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

  pw.TableRow _row(List<String> cells, {bool header = false}) => pw.TableRow(
        decoration: header
            ? const pw.BoxDecoration(color: PdfColors.grey300)
            : null,
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
