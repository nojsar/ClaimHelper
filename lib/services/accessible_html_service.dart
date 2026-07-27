import '../models/appeal_case.dart';
import 'html_download.dart';

/// Builds a standalone, semantic HTML equivalent of the appeal packet.
///
/// The generated file has no scripts, external assets, tracking, or network
/// dependencies. It preserves headings, lists, and table relationships for
/// screen readers and reflows without horizontal scrolling at narrow widths.
class AccessibleHtmlService {
  Future<void> exportPacket(AppealCase appealCase) async {
    final html = buildPacketHtml(appealCase);
    final safeId = appealCase.id.replaceAll(RegExp(r'[^A-Za-z0-9_-]'), '_');
    await downloadHtml(html, 'appeal_packet_$safeId.html');
  }

  String buildPacketHtml(
    AppealCase appealCase, {
    DateTime? preparedAt,
  }) {
    final packet = appealCase.packet;
    if (packet == null) {
      throw ArgumentError.value(
        appealCase.id,
        'appealCase',
        'An appeal packet is required for HTML export.',
      );
    }
    final extraction = appealCase.extraction;
    final prepared =
        (preparedAt ?? DateTime.now()).toIso8601String().split('T').first;
    final out = StringBuffer()
      ..writeln('<!doctype html>')
      ..writeln('<html lang="en">')
      ..writeln('<head>')
      ..writeln('<meta charset="utf-8">')
      ..writeln(
          '<meta name="viewport" content="width=device-width, initial-scale=1">')
      ..writeln('<title>Appeal packet | GetMyYes</title>')
      ..writeln('<style>')
      ..writeln(_styles)
      ..writeln('</style>')
      ..writeln('</head>')
      ..writeln('<body>')
      ..writeln('<a class="skip-link" href="#main">Skip to main content</a>')
      ..writeln('<main id="main">')
      ..writeln('<header>')
      ..writeln('<p class="eyebrow">GETMYYES ACCESSIBLE PACKET</p>')
      ..writeln('<h1>Appeal packet</h1>')
      ..writeln('<p>Prepared ${_escape(prepared)}</p>');

    if (extraction != null) {
      out
        ..writeln('<dl class="case-details">')
        ..writeln(
            '<div><dt>Denied item</dt><dd>${_escape(extraction.deniedItem ?? 'Not provided')}</dd></div>')
        ..writeln(
            '<div><dt>Insurer</dt><dd>${_escape(extraction.insurerName ?? 'Not provided')}</dd></div>')
        ..writeln(
            '<div><dt>Appeal deadline</dt><dd>${_escape(extraction.appealDeadline ?? 'Confirm with insurer')}</dd></div>')
        ..writeln('</dl>');
    }

    out
      ..writeln(
          '<p class="notice"><strong>Accessible version:</strong> This semantic HTML file contains your generated packet, follow-up drafts, and saved submission tracker. Review all information before sending.</p>')
      ..writeln('</header>')
      ..writeln(_textSection(
          'summary', 'Plain-English summary', packet.plainEnglishSummary))
      ..writeln(
          _textSection('strategy', 'Appeal strategy', packet.appealStrategy))
      ..writeln(
          _draftSection('appeal-letter', 'Appeal letter', packet.appealLetter))
      ..writeln(_draftSection('doctor-request', 'Doctor letter request',
          packet.doctorLetterRequest))
      ..writeln('<section aria-labelledby="evidence-heading">')
      ..writeln('<h2 id="evidence-heading">Evidence checklist</h2>')
      ..writeln('<table>')
      ..writeln('<caption>Evidence to include with the appeal</caption>')
      ..writeln(
          '<thead><tr><th scope="col">Item</th><th scope="col">Why needed</th><th scope="col">Status</th></tr></thead>')
      ..writeln('<tbody>');
    if (packet.evidenceChecklist.isEmpty) {
      out.writeln(
          '<tr><td colspan="3">No evidence items were generated.</td></tr>');
    } else {
      for (final item in packet.evidenceChecklist) {
        out.writeln('<tr><th scope="row">${_escape(item.item)}</th>'
            '<td>${_escape(item.whyNeeded)}</td>'
            '<td>${_escape(item.status)}</td></tr>');
      }
    }
    out
      ..writeln('</tbody></table>')
      ..writeln('</section>')
      ..writeln(_draftSection(
          'call-script', 'Insurer call script', packet.insurerCallScript))
      ..writeln('<section aria-labelledby="deadlines-heading">')
      ..writeln('<h2 id="deadlines-heading">Deadlines and reminders</h2>')
      ..writeln('<table>')
      ..writeln('<caption>Appeal tasks and deadlines</caption>')
      ..writeln(
          '<thead><tr><th scope="col">Task</th><th scope="col">Due date</th><th scope="col">Priority</th></tr></thead>')
      ..writeln('<tbody>');
    if (packet.deadlineChecklist.isEmpty) {
      out.writeln(
          '<tr><td colspan="3">No deadline items were generated. Confirm deadlines with your insurer.</td></tr>');
    } else {
      for (final item in packet.deadlineChecklist) {
        out.writeln('<tr><th scope="row">${_escape(item.task)}</th>'
            '<td>${_escape(item.dueDate ?? 'Confirm with insurer')}</td>'
            '<td>${_escape(item.priority)}</td></tr>');
      }
    }
    out
      ..writeln('</tbody></table>')
      ..writeln('</section>')
      ..writeln(_trackerSection(appealCase))
      ..writeln('<section aria-labelledby="warnings-heading">')
      ..writeln('<h2 id="warnings-heading">Important warnings</h2>');
    if (packet.warnings.isEmpty) {
      out.writeln('<p>No additional warnings were generated.</p>');
    } else {
      out
        ..writeln('<ul>')
        ..writeAll(
            packet.warnings.map((warning) => '<li>${_escape(warning)}</li>'))
        ..writeln('</ul>');
    }
    out
      ..writeln('</section>')
      ..writeln('<section aria-labelledby="follow-ups-heading">')
      ..writeln('<h2 id="follow-ups-heading">Follow-up rounds</h2>');
    if (appealCase.followUps.isEmpty) {
      out.writeln('<p>No follow-up rounds have been generated.</p>');
    } else {
      for (var i = 0; i < appealCase.followUps.length; i++) {
        final round = appealCase.followUps[i];
        out
          ..writeln('<article>')
          ..writeln('<h3>Round ${i + 1}: ${_escape(round.outcome)}</h3>');
        if (round.createdAt != null) {
          final created = round.createdAt!.toIso8601String().split('T').first;
          out.writeln(
              '<p class="meta"><time datetime="${_escape(created)}">Created ${_escape(created)}</time></p>');
        }
        out
          ..writeln('<h4>Situation summary</h4>')
          ..writeln('<p>${_escape(round.situationSummary)}</p>')
          ..writeln('<h4>Recommended next steps</h4>')
          ..writeln('<pre>${_escape(round.recommendedNextSteps)}</pre>')
          ..writeln('<h4>Your next letter</h4>')
          ..writeln('<pre>${_escape(round.responseLetter)}</pre>')
          ..writeln('<h4>Updated call script</h4>')
          ..writeln('<pre>${_escape(round.callScript)}</pre>');
        if (round.deadlineNotes != null && round.deadlineNotes!.isNotEmpty) {
          out
            ..writeln('<h4>Deadline notes</h4>')
            ..writeln('<p>${_escape(round.deadlineNotes!)}</p>');
        }
        if (round.warnings.isNotEmpty) {
          out
            ..writeln('<h4>Warnings</h4>')
            ..writeln('<ul>')
            ..writeAll(
                round.warnings.map((warning) => '<li>${_escape(warning)}</li>'))
            ..writeln('</ul>');
        }
        out
          ..writeln('<p class="disclaimer">${_escape(round.disclaimer)}</p>')
          ..writeln('</article>');
      }
    }
    out
      ..writeln('</section>')
      ..writeln('<footer>')
      ..writeln('<h2>Disclaimer</h2>')
      ..writeln('<p>${_escape(packet.disclaimer)}</p>')
      ..writeln(
          '<p>GetMyYes draft — review before sending. Not medical, legal, or insurance advice.</p>')
      ..writeln('</footer>')
      ..writeln('</main>')
      ..writeln('</body>')
      ..writeln('</html>');
    return out.toString();
  }

  String _textSection(String id, String title, String value) =>
      '<section aria-labelledby="$id-heading">'
      '<h2 id="$id-heading">${_escape(title)}</h2>'
      '<p>${_escape(value)}</p>'
      '</section>';

  String _draftSection(String id, String title, String value) =>
      '<section aria-labelledby="$id-heading">'
      '<h2 id="$id-heading">${_escape(title)}</h2>'
      '<pre>${_escape(value)}</pre>'
      '</section>';

  String _trackerSection(AppealCase appealCase) {
    final tracker = appealCase.caseTracker;
    if (tracker == null) {
      return '<section aria-labelledby="submission-tracker-heading">'
          '<h2 id="submission-tracker-heading">Submission tracker</h2>'
          '<p>No appeal submission has been recorded for this case.</p>'
          '</section>';
    }

    final confirmation = tracker.confirmationNumber?.trim();
    return '<section aria-labelledby="submission-tracker-heading">'
        '<h2 id="submission-tracker-heading">Submission tracker</h2>'
        '<dl class="case-details">'
        '${_dateDetail('Submitted date', tracker.submittedDate)}'
        '<div><dt>Submission method</dt><dd>${_escape(tracker.submissionMethod.label)}</dd></div>'
        '<div><dt>Confirmation or reference number</dt><dd>${_escape(
      confirmation == null || confirmation.isEmpty
          ? 'Not provided'
          : confirmation,
    )}</dd></div>'
        '${_dateDetail('Expected response date', tracker.expectedResponseDate)}'
        '${_dateDetail('Response received date', tracker.responseDate)}'
        '<div><dt>Insurer status</dt><dd>${_escape(tracker.responseStatus.label)}</dd></div>'
        '<div><dt>Current outcome</dt><dd>${_escape(tracker.outcome.label)}</dd></div>'
        '<div><dt>Email response reminder</dt><dd>${tracker.responseReminderEnabled ? 'Enabled' : 'Not enabled'}</dd></div>'
        '</dl>'
        '</section>';
  }

  String _dateDetail(String label, DateTime? value) {
    if (value == null) {
      return '<div><dt>${_escape(label)}</dt><dd>Not set</dd></div>';
    }
    final date = value.toIso8601String().split('T').first;
    return '<div><dt>${_escape(label)}</dt>'
        '<dd><time datetime="${_escape(date)}">${_escape(date)}</time></dd></div>';
  }

  String _escape(String value) => value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');

  static const _styles = '''
:root { color-scheme: light; }
* { box-sizing: border-box; }
html { font-size: 100%; }
body {
  margin: 0;
  background: #ffffff;
  color: #1c160c;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 1rem;
  line-height: 1.6;
}
main { width: min(100% - 2rem, 70rem); margin: 0 auto; padding: 2rem 0 4rem; }
header, section, article, footer { margin-block: 1.5rem; }
section, article, footer { border-top: 0.125rem solid #dcd2ba; padding-top: 1rem; }
h1, h2, h3, h4 { line-height: 1.25; }
h1 { font-size: clamp(2rem, 6vw, 3rem); }
h2 { font-size: 1.5rem; }
h3 { font-size: 1.25rem; }
.eyebrow { font-weight: 700; letter-spacing: 0.08em; }
.notice { border-left: 0.3rem solid #8f1922; padding: 0.75rem 1rem; background: #f3e2de; }
.case-details { display: grid; gap: 0.75rem; }
.case-details div { display: grid; grid-template-columns: minmax(8rem, 12rem) 1fr; gap: 0.75rem; }
dt { font-weight: 700; }
dd { margin: 0; overflow-wrap: anywhere; }
pre {
  margin: 0;
  border: 0.0625rem solid #b9ac8f;
  background: #fbf7ec;
  padding: 1rem;
  color: #1c160c;
  font: inherit;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
caption { text-align: left; font-weight: 700; padding-block: 0.5rem; }
th, td { border: 0.0625rem solid #746a52; padding: 0.625rem; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
thead th { background: #eae1cc; }
.disclaimer, footer { font-style: italic; }
.skip-link {
  position: absolute;
  left: 0.5rem;
  top: 0.5rem;
  transform: translateY(-200%);
  background: #1c160c;
  color: #ffffff;
  padding: 0.75rem 1rem;
  z-index: 10;
}
.skip-link:focus { transform: translateY(0); }
a:focus-visible { outline: 0.2rem solid #b3202a; outline-offset: 0.2rem; }
@media (max-width: 32rem) {
  main { width: min(100% - 1rem, 70rem); }
  .case-details div { grid-template-columns: 1fr; gap: 0; }
  th, td { padding: 0.4rem; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; }
}
@media print {
  .skip-link { display: none; }
  main { width: 100%; padding: 0; }
}
''';
}
