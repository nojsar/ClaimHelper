import assert from "node:assert/strict";
import test from "node:test";

import { config } from "../config";
import {
  buildReminderMessage,
  buildReviewInviteMessage,
  feedbackReminderId,
  reviewInviteReminderId,
  scheduleReviewInvite,
} from "../reminders";

test("review invitations use one deterministic case-scoped id", () => {
  assert.equal(reviewInviteReminderId("case_123"), "review_case_123");
  assert.equal(
    reviewInviteReminderId("case_123"),
    reviewInviteReminderId("case_123"),
  );
  // Distinct from the private feedback request so one purchase can carry both
  // without either overwriting the other.
  assert.notEqual(reviewInviteReminderId("case_123"), feedbackReminderId("case_123"));
});

test("review invitations are off until an invitation address is configured", async () => {
  assert.equal(config.trustpilotInviteEmail, "");
  assert.equal(config.reviewInviteDelayDays, 21);
  // Returns before touching Firestore, so an unconfigured deployment neither
  // stores a delivery address nor schedules a message it cannot send.
  await scheduleReviewInvite({
    caseId: "case_123",
    ownerUid: "uid_1",
    email: "buyer@example.com",
  });
});

test("the invitation email names Trustpilot and links the case", () => {
  const message = buildReviewInviteMessage({
    caseUrl: "https://getmyyes.com/#/case/case_123/packet",
  });
  for (const body of [message.text, message.html]) {
    assert.match(body, /Trustpilot/);
    assert.match(body, /https:\/\/getmyyes\.com\/#\/case\/case_123\/packet/);
    // Uniform invitation, stated in the message itself.
    assert.match(body, /every customer gets the same invitation/);
    assert.match(body, /reply STOP/);
  }
  assert.equal(message.subject, "How did your appeal go?");
});

test("nothing blind-copied to Trustpilot carries case facts", () => {
  const message = buildReviewInviteMessage({
    caseUrl: "https://getmyyes.com/#/case/case_123/packet",
  });
  // The reminder emails that stay between us and the customer do carry these
  // labels; the invitation body reaches a third party, so it must not.
  const withFacts = buildReminderMessage({
    subject: "Your appeal deadline is about a week away",
    intro: "Closing soon.",
    amount: "$2,400",
    deadline: new Date("2026-08-01T00:00:00Z"),
    caseUrl: "https://getmyyes.com/#/case/case_123/preview",
  });
  assert.match(withFacts.text, /At stake/);
  assert.match(withFacts.text, /Appeal deadline/);

  for (const body of [message.text, message.html]) {
    assert.doesNotMatch(body, /At stake/);
    assert.doesNotMatch(body, /Appeal deadline/);
    assert.doesNotMatch(body, /\$[0-9]/);
  }
});
