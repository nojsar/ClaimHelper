import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function source(name: string): string {
  return readFileSync(resolve(__dirname, "..", "..", "src", name), "utf8");
}

test("case milestone and daily aggregate writes share one transaction", () => {
  const analytics = source("analytics.ts");
  assert.match(analytics, /runTransaction\(async \(transaction\) =>/);
  assert.match(
    analytics,
    /transaction\.update\(caseRef, \{[\s\S]*analyticsMilestones\.\$\{milestone\}[\s\S]*true/,
  );
  assert.match(analytics, /transaction\.set\([\s\S]*dailyRef/);
  assert.match(analytics, /caseSnapshot\.get\("ownerUid"\) !== uid/);
  assert.match(analytics, /isAdminAnalyticsUid\(uid\)/);
});

test("public analytics endpoints enforce provenance without broad CORS", () => {
  const analytics = source("analytics.ts");
  assert.doesNotMatch(analytics, /cors:\s*true/);
  assert.match(
    analytics,
    /setAdminAnalyticsExclusion[\s\S]*isTrustedAnalyticsRequest\(req\.headers\)/,
  );
  assert.match(
    analytics,
    /trackEvent[\s\S]*isTrustedAnalyticsRequest\(req\.headers\)/,
  );
  for (const header of [
    "Content-Security-Policy",
    "Cross-Origin-Opener-Policy",
    "Cross-Origin-Resource-Policy",
    "X-Permitted-Cross-Domain-Policies",
  ]) {
    assert.match(analytics, new RegExp(`setHeader\\("${header}"`));
  }
  assert.match(
    analytics,
    /setAdminAnalyticsExclusion[\s\S]*setAnalyticsSecurityHeaders\(res\)/,
  );
  assert.match(
    analytics,
    /trackEvent[\s\S]*setAnalyticsSecurityHeaders\(res\)/,
  );
});

test("extraction records first start, completion, and bounded failures", () => {
  const extraction = source("extraction.ts");
  assert.match(extraction, /"extraction_started"/);
  assert.match(extraction, /"extraction_completed"/);
  assert.match(extraction, /"validation"/);
  assert.match(extraction, /"missing_prerequisite"/);
  assert.match(extraction, /modelAnalyticsErrorCategory\(err\)/);
});

test("preview completion uses only the first-per-case funnel writer", () => {
  const preview = source("preview.ts");
  assert.match(preview, /"preview_started"/);
  assert.match(preview, /"preview_completed"/);
  assert.match(preview, /"rate_limit"/);
  assert.match(preview, /"missing_prerequisite"/);
  assert.match(preview, /modelAnalyticsErrorCategory\(err\)/);
  assert.doesNotMatch(preview, /bumpUserDaily/);
});

test("packet records first start, completion, and bounded failures", () => {
  const packet = source("packet.ts");
  assert.match(packet, /"packet_started"/);
  assert.match(packet, /"packet_completed"/);
  assert.match(packet, /"missing_prerequisite"/);
  assert.match(packet, /modelAnalyticsErrorCategory\(err\)/);
});

test("upload, checkout, and paid funnel steps are first-per-case", () => {
  const cases = source("cases.ts");
  const payments = source("payments.ts");
  assert.match(cases, /recordFirstCaseAnalyticsEvent\(uid, caseRef, "uploaded"\)/);
  assert.doesNotMatch(cases, /bumpUserDaily/);
  assert.match(payments, /"checkout_started"/);
  assert.match(payments, /"paid"/);
  assert.doesNotMatch(payments, /"funnel\.checkout_started"/);
  assert.doesNotMatch(payments, /"funnel\.paid"/);
});

test("checkout recovery and duplicate protection are server-side and bounded", () => {
  const payments = source("payments.ts");
  const analytics = source("analytics.ts");
  assert.match(payments, /after_expiration:\s*\{[\s\S]*recovery:\s*\{[\s\S]*enabled:\s*true/);
  assert.match(payments, /checkout\.session\.expired/);
  assert.match(payments, /checkout\.session\.async_payment_succeeded/);
  assert.match(payments, /checkout\.session\.async_payment_failed/);
  assert.match(payments, /session\.payment_status !== "paid"/);
  assert.match(payments, /activeCheckout/);
  assert.match(payments, /stripe\.checkout\.sessions\.retrieve/);
  assert.match(payments, /const CHECKOUT_CREATION_TTL_SECONDS = 5 \* 60/);
  assert.match(
    payments,
    /getFirestore\(\)\.runTransaction\(async \(tx\) => \{[\s\S]*currentCase\.get\("ownerUid"\) !== uid[\s\S]*currentCase\.get\("paid"\)[\s\S]*currentCase\.get\("fullCase"\)/,
  );
  assert.match(
    payments,
    /inProgress && inProgress\.expiresAt > nowSeconds[\s\S]*inProgress\.kind === kind[\s\S]*return inProgress\.token/,
  );
  assert.match(
    payments,
    /idempotencyKey: `getmyyes-checkout-\$\{kind\}-\$\{checkoutCreationToken\}`/,
  );
  assert.match(payments, /creationToken: checkoutCreationToken/);
  assert.match(
    payments,
    /inProgress && inProgress\.expiresAt > nowSeconds[\s\S]*inProgress\.kind === kind[\s\S]*Another checkout is already being prepared/,
  );
  assert.match(
    payments,
    /currentCreation\?\.token !== checkoutCreationToken[\s\S]*currentCreation\.kind !== kind[\s\S]*return false/,
  );
  assert.match(
    payments,
    /if \(!stored\)[\s\S]*stripe\.checkout\.sessions\.expire\(session\.id\)[\s\S]*Checkout state changed/,
  );
  assert.match(
    payments,
    /creation\?\.token === sessionCreationToken[\s\S]*checkoutCreation: FieldValue\.delete\(\)/,
  );
  assert.match(
    payments,
    /recoveredFromSessionId === active\?\.sessionId/,
  );
  assert.doesNotMatch(
    payments,
    /isRecovered && active\?\.kind === kind/,
  );
  assert.match(
    payments,
    /existing\?\.status === "complete" && existing\.payment_status === "paid"[\s\S]*handleCompletedCheckout\(existing\)[\s\S]*completed: true/,
  );
  assert.match(
    payments,
    /A delayed payment can be Checkout-complete before Stripe settles it[\s\S]*existing\?\.status === "complete"[\s\S]*payment is still being confirmed/,
  );
  assert.match(payments, /duplicate_pending_refund/);
  assert.match(payments, /reason === "duplicate"/);
  assert.match(payments, /getmyyes-duplicate-\$\{session\.id\}/);
  assert.match(payments, /checkout_created/);
  assert.match(payments, /checkout_expired/);
  assert.match(payments, /checkout_recovered/);
  assert.match(payments, /checkout_duplicate/);
  assert.match(payments, /orphaned_pending_refund/);
  assert.match(payments, /active\?\.kind === kind && active\.sessionId !== session\.id && !isRecovered/);
  assert.match(payments, /repairInitialSideEffects: completedInitialPurchase/);
  assert.match(
    payments,
    /if \(result\.repairInitialSideEffects\) \{[\s\S]*\/\/ Acquisition credit[\s\S]*recordFirstPaidAcquisitionAttribution/,
  );
  assert.match(analytics, /After the Stripe webhook has confirmed payment/);
  assert.doesNotMatch(analytics, /paid acquisition attribution failed \(ignored\)/);
});

test("every settled charge is counted before a retryable refund settles it", () => {
  const payments = source("payments.ts");
  const analytics = source("analytics.ts");
  assert.match(payments, /const refundPending = duplicate \|\| invalidState/);
  assert.match(payments, /invalid_state_pending_refund/);
  assert.match(payments, /requested_by_customer/);
  assert.match(
    payments,
    /A completed Checkout charge is a payment movement[\s\S]*recordFirstPurchaseMonetizationEvent\([\s\S]*"paid"[\s\S]*if \(result\.refundPending\)/,
  );
  assert.match(
    analytics,
    /Unlike non-financial product analytics[\s\S]*Stripe's[\s\S]*reconciliation watchdog/,
  );
  assert.doesNotMatch(
    analytics,
    /purchase monetization analytics failed \(ignored\)/,
  );
  assert.match(
    analytics,
    /recordFirstPurchaseMonetizationEvent[\s\S]*return firestore\.runTransaction/,
  );
  assert.match(
    payments,
    /refundStatus: "pending",[\s\S]*refundAttempts: FieldValue\.increment\(1\)[\s\S]*throw new Error\("Stripe refund attempt failed"\)/,
  );
  assert.match(payments, /getmyyes-invalid-state-\$\{session\.id\}/);
  assert.match(payments, /refund\.created" \|\| event\.type === "refund\.updated/);
  assert.match(payments, /handleSucceededRefund\(event\.data\.object as Stripe\.Refund\)/);
  assert.match(payments, /event\.type === "refund\.failed"[\s\S]*handleFailedRefund/);
  assert.match(payments, /refund\.status !== "succeeded"/);
  assert.match(payments, /refund\.status === "pending" \|\| refund\.status === "requires_action"/);
  assert.match(payments, /Preserve it for support rather than overwriting manual_review/);
  assert.match(payments, /paymentIntentId", "==", paymentIntentId/);
  assert.match(payments, /refundStatus: cumulativeCents >= purchaseCents \? "refunded" : "partially_refunded"/);
  assert.match(payments, /recordPurchaseRefundMonetizationEvent\([\s\S]*refund\.id,[\s\S]*refundCents/);
  assert.match(analytics, /multiple partial refunds[\s\S]*purchaseRef\.collection\("refunds"\)\.doc\(refundId\)/);
  assert.match(analytics, /unless the matching charge[\s\S]*monetization_paid !== true/);
  assert.match(analytics, /refund\.get\("analyticsRecorded"\) === true/);
});

test("pending refunds have a bounded Stripe API reconciliation fallback", () => {
  const payments = source("payments.ts");
  const index = source("index.ts");
  assert.match(payments, /export function refundNeedsReconciliation/);
  assert.match(payments, /refundStatus === "pending" \|\| args\.refundStatus === "manual_review"/);
  assert.match(payments, /export const reconcileStripeRefunds = onSchedule/);
  assert.match(payments, /schedule: "every 30 minutes"/);
  assert.match(payments, /secrets: \[stripeSecretKey\]/);
  assert.match(payments, /PENDING_REFUND_RECONCILIATION_LIMIT = 10/);
  assert.match(payments, /MANUAL_REFUND_RECONCILIATION_LIMIT = 5/);
  assert.match(payments, /stripeClient\(\)\.refunds\.retrieve/);
  assert.match(payments, /refund\.status === "succeeded"[\s\S]*handleSucceededRefund/);
  assert.match(payments, /refund\.status === "failed" \|\| refund\.status === "canceled"/);
  assert.match(index, /reconcileStripeRefunds/);
});

test("paid checkouts have a bounded webhook-independent fulfillment fallback", () => {
  const payments = source("payments.ts");
  const index = source("index.ts");
  assert.match(payments, /checkoutReconciliationAt: Timestamp\.fromMillis/);
  assert.match(payments, /export const reconcileStripeCheckouts = onSchedule/);
  assert.match(payments, /schedule: "every 5 minutes"/);
  assert.match(payments, /CHECKOUT_RECONCILIATION_LIMIT = 10/);
  assert.match(
    payments,
    /\.where\("checkoutReconciliationAt", "<=", Timestamp\.now\(\)\)[\s\S]*\.limit\(CHECKOUT_RECONCILIATION_LIMIT\)/,
  );
  assert.match(
    payments,
    /session\.status === "complete" && session\.payment_status === "paid"[\s\S]*handleCompletedCheckout\(session\)/,
  );
  assert.match(payments, /session\.status === "expired"[\s\S]*handleExpiredCheckout\(session\)/);
  assert.match(
    payments,
    /export const confirmCheckoutSession[\s\S]*requireOwnedCase\(request\.data\?\.caseId, uid\)[\s\S]*stripeCheckoutSessionId\(request\.data\?\.sessionId\)/,
  );
  assert.match(
    payments,
    /sessionCaseId !== caseSnap\.id \|\| session\.metadata\?\.uid !== uid/,
  );
  assert.match(
    payments,
    /if \(status === "paid"\) \{[\s\S]*await handleCompletedCheckout\(session\)/,
  );
  assert.match(
    payments,
    /updateCheckoutReconciliation\([\s\S]*active\?\.sessionId !== expectedSessionId[\s\S]*storedSessionId !== expectedSessionId/,
  );
  assert.match(index, /confirmCheckoutSession/);
  assert.match(index, /reconcileStripeCheckouts/);
});

test("paid add-on expiry and delayed-payment failures clear only their own checkout", () => {
  const payments = source("payments.ts");
  assert.match(
    payments,
    /A late expiry for the already-paid initial package[\s\S]*isInitialPurchase \|\| !kind/,
  );
  assert.match(
    payments,
    /const casePath = isInitialPurchase \? "preview" : "packet"/,
  );
  assert.match(
    payments,
    /handleAsyncPaymentFailed[\s\S]*const kind = sessionKind \?\? active\?\.kind \?\? null[\s\S]*isInitialPurchase \|\| !kind/,
  );
  assert.match(
    payments,
    /recordFirstCaseMonetizationEvent\([\s\S]*result\.kind,[\s\S]*"checkout_expired"/,
  );
});

test("reminder opt-in extends only unpaid opted-in preview cases", () => {
  const reminders = source("reminders.ts");
  assert.match(reminders, /if \(snap\.get\("paid"\) === true\)/);
  assert.match(reminders, /reminderOptInExpiry/);
  assert.match(reminders, /expiresAt:\s*expiryUpdate/);
  assert.match(reminders, /reminderOptInCaseTtlDays/);
});

test("case deletion removes case-tagged queued transactional email", () => {
  const cases = source("cases.ts");
  const payments = source("payments.ts");
  const reminders = source("reminders.ts");
  const cleanup = source("cleanup.ts");
  assert.match(cases, /collection\("mail"\)[\s\S]*\.where\("caseId", "==", caseId\)/);
  assert.match(payments, /tx\.set\(mailRef, \{[\s\S]*caseId,[\s\S]*ownerUid,/);
  assert.match(reminders, /collection\("mail"\)\.add\(\{[\s\S]*caseId: snap\.id,[\s\S]*ownerUid: uid,/);
  assert.match(cleanup, /collection\("mail"\)\.add\(\{[\s\S]*caseId: doc\.get\("caseId"\)/);
});
