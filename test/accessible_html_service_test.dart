import 'package:claimhelper/models/appeal_case.dart';
import 'package:claimhelper/models/case_tracker.dart';
import 'package:claimhelper/models/follow_up.dart';
import 'package:claimhelper/models/packet.dart';
import 'package:claimhelper/services/accessible_html_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const packet = AppealPacket(
    plainEnglishSummary: 'Summary <script>alert("bad")</script> & details',
    appealStrategy: 'Strategy',
    appealLetter: 'Dear Appeals,\nPlease reverse the denial.',
    doctorLetterRequest: 'Dear Doctor,\nPlease document medical necessity.',
    evidenceChecklist: [
      EvidenceItem(
        item: 'Doctor letter',
        whyNeeded: 'Explains trial & failure',
        status: 'missing',
      ),
    ],
    insurerCallScript: 'Please confirm the appeal deadline.',
    deadlineChecklist: [
      DeadlineItem(
        task: 'File appeal',
        dueDate: '2026-08-17',
        priority: 'high',
      ),
    ],
    warnings: ['Confirm the deadline <directly>.'],
    disclaimer: 'Not legal or medical advice.',
  );

  final appealCase = AppealCase(
    id: 'case-1',
    status: CaseStatus.generated,
    paid: true,
    packet: packet,
    followUps: [
      FollowUpRound(
        outcome: 'Denied again',
        situationSummary: 'The first appeal was denied.',
        recommendedNextSteps: '1. Request external review.',
        responseLetter: 'Please begin external review.',
        callScript: 'Has external review started?',
        deadlineNotes: 'Submit within 30 days.',
        warnings: ['Confirm this deadline.'],
        disclaimer: 'Follow-up draft only.',
        createdAt: DateTime.utc(2026, 7, 12, 14, 30),
      ),
    ],
    caseTracker: CaseTracker(
      submittedDate: DateTime.utc(2026, 7, 1),
      submissionMethod: SubmissionMethod.certifiedMail,
      confirmationNumber: 'CONF-<123>',
      expectedResponseDate: DateTime.utc(2026, 7, 31),
      responseStatus: InsurerResponseStatus.underReview,
      outcome: AppealOutcome.pending,
      responseReminderEnabled: true,
    ),
  );

  test('builds standalone semantic HTML with every packet section', () {
    final html = AccessibleHtmlService().buildPacketHtml(
      appealCase,
      preparedAt: DateTime.utc(2026, 7, 13),
    );

    expect(html, startsWith('<!doctype html>'));
    expect(html, contains('<html lang="en">'));
    expect(html, contains('<main id="main">'));
    expect(html, contains('href="#main">Skip to main content</a>'));
    expect(html, contains('<h1>Appeal packet</h1>'));

    for (final heading in [
      'Plain-English summary',
      'Appeal strategy',
      'Appeal letter',
      'Doctor letter request',
      'Evidence checklist',
      'Insurer call script',
      'Deadlines and reminders',
      'Submission tracker',
      'Important warnings',
      'Follow-up rounds',
      'Disclaimer',
    ]) {
      expect(html, contains(heading), reason: 'Missing section: $heading');
    }

    expect(html,
        contains('<caption>Evidence to include with the appeal</caption>'));
    expect(html, contains('<th scope="col">Item</th>'));
    expect(html, contains('<th scope="row">Doctor letter</th>'));
    expect(html, contains('<article>'));
    expect(html, contains('<h3>Round 1: Denied again</h3>'));
    expect(
      html,
      contains('<time datetime="2026-07-12">Created 2026-07-12</time>'),
    );
    expect(
      html,
      contains('<time datetime="2026-07-01">2026-07-01</time>'),
    );
    expect(html, contains('Certified mail'));
    expect(html, contains('CONF-&lt;123&gt;'));
    expect(html, contains('Under review'));
    expect(html, contains('Email response reminder</dt><dd>Enabled'));
  });

  test('escapes generated and user-controlled content', () {
    final html = AccessibleHtmlService().buildPacketHtml(appealCase);

    expect(html, isNot(contains('<script>alert("bad")</script>')));
    expect(
        html, contains('&lt;script&gt;alert(&quot;bad&quot;)&lt;/script&gt;'));
    expect(html, contains('trial &amp; failure'));
    expect(html, contains('deadline &lt;directly&gt;'));
  });

  test('includes zoom-safe and visible-focus styles', () {
    final html = AccessibleHtmlService().buildPacketHtml(appealCase);

    expect(html, contains('table-layout: fixed'));
    expect(html, contains('white-space: pre-wrap'));
    expect(html, contains('overflow-wrap: anywhere'));
    expect(html, contains('.skip-link:focus'));
    expect(html, contains('a:focus-visible'));
    expect(html, contains('@media (prefers-reduced-motion: reduce)'));
  });

  test('rejects export when a packet has not been generated', () {
    const missing = AppealCase(id: 'missing', status: CaseStatus.paid);

    expect(
      () => AccessibleHtmlService().buildPacketHtml(missing),
      throwsArgumentError,
    );
  });

  test('makes an unrecorded submission explicit instead of inventing one', () {
    const withoutTracker = AppealCase(
      id: 'case-without-tracker',
      status: CaseStatus.generated,
      paid: true,
      packet: packet,
    );

    final html = AccessibleHtmlService().buildPacketHtml(withoutTracker);

    expect(html, contains('<h2 id="submission-tracker-heading">'));
    expect(
      html,
      contains('No appeal submission has been recorded for this case.'),
    );
    expect(html, isNot(contains('Submitted date</dt>')));
  });
}
