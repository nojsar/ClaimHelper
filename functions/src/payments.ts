import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import {
  DocumentReference,
  FieldValue,
  getFirestore,
  Timestamp,
} from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { ADMIN_UID, config, stripeSecretKey, stripeWebhookSecret } from "./config";
import { requireUid, requireOwnedCase } from "./util";
import {
  bumpUserDaily,
  isAdminAnalyticsUid,
  recordFirstCaseAnalyticsEvent,
  recordFirstCaseMonetizationEvent,
  recordFirstPaidAcquisitionAttribution,
  recordFirstPurchaseMonetizationEvent,
  recordPurchaseRefundMonetizationEvent,
} from "./analytics";
import { scheduleFeedbackRequest } from "./reminders";
import { remainingFollowUpCredits } from "./entitlements";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PENDING_REFUND_RECONCILIATION_LIMIT = 10;
const MANUAL_REFUND_RECONCILIATION_LIMIT = 5;
const CHECKOUT_CREATION_TTL_SECONDS = 5 * 60;
const CHECKOUT_RECONCILIATION_LIMIT = 10;
const CHECKOUT_RECONCILIATION_INITIAL_DELAY_MS = 5 * 60 * 1000;
const CHECKOUT_RECONCILIATION_RECHECK_MS = 30 * 60 * 1000;
type PurchaseKind = "packet" | "packet_plus" | "followup_round" | "full_case";
type RefundReason = "duplicate" | "requested_by_customer";

interface ActiveCheckout {
  sessionId: string;
  kind: PurchaseKind;
  expiresAt: number;
}

interface CheckoutCreation {
  token: string;
  kind: PurchaseKind;
  expiresAt: number;
}

function stripeClient(): Stripe {
  const key = stripeSecretKey.value() || process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new HttpsError(
      "failed-precondition",
      "Stripe is not configured (STRIPE_SECRET_KEY missing).",
    );
  }
  return new Stripe(key);
}

function parsePurchaseKind(value: unknown): PurchaseKind | null {
  return value === "packet" || value === "packet_plus" ||
      value === "followup_round" || value === "full_case"
    ? value
    : null;
}

function activeCheckout(value: unknown): ActiveCheckout | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const kind = parsePurchaseKind(candidate.kind);
  if (
    typeof candidate.sessionId !== "string" ||
    !kind ||
    typeof candidate.expiresAt !== "number" ||
    !Number.isFinite(candidate.expiresAt)
  ) return null;
  return { sessionId: candidate.sessionId, kind, expiresAt: candidate.expiresAt };
}

function checkoutCreation(value: unknown): CheckoutCreation | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const kind = parsePurchaseKind(candidate.kind);
  const token = stripeCheckoutCreationToken(candidate.token);
  if (
    !token ||
    !kind ||
    typeof candidate.expiresAt !== "number" ||
    !Number.isFinite(candidate.expiresAt)
  ) return null;
  return { token, kind, expiresAt: candidate.expiresAt };
}

function stripeObjectId(value: string | { id: string } | null | undefined): string | null {
  return typeof value === "string" ? value : value?.id ?? null;
}

function recoveredCheckoutSessionId(session: Stripe.Checkout.Session): string | null {
  const recovered = (
    session as Stripe.Checkout.Session & {
      recovered_from?: string | { id: string } | null;
    }
  ).recovered_from;
  return stripeCheckoutSessionId(stripeObjectId(recovered));
}

function recoveredCheckoutSession(session: Stripe.Checkout.Session): boolean {
  return recoveredCheckoutSessionId(session) !== null;
}

function refundReason(value: unknown): RefundReason | null {
  return value === "duplicate" || value === "requested_by_customer"
    ? value
    : null;
}

function safePositiveCents(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.min(100_000_000, Math.floor(value))
    : null;
}

function storedAmountCents(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.min(100_000_000, Math.round(value * 100))
    : null;
}

export function refundNeedsReconciliation(args: {
  refundStatus: unknown;
  stripeRefundId: unknown;
}): boolean {
  return (args.refundStatus === "pending" || args.refundStatus === "manual_review") &&
    typeof args.stripeRefundId === "string" &&
    /^re_[A-Za-z0-9_]{3,255}$/.test(args.stripeRefundId);
}

export function stripeCheckoutSessionId(value: unknown): string | null {
  return typeof value === "string" &&
      /^cs_(?:test|live)_[A-Za-z0-9]{8,255}$/.test(value)
    ? value
    : null;
}

export function stripeCheckoutCreationToken(value: unknown): string | null {
  return typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

export type CheckoutConfirmationStatus =
  | "open"
  | "processing"
  | "paid"
  | "expired";

/**
 * A bounded status returned to the browser after Stripe redirects it home.
 * Raw Stripe state and payment details never cross the callable boundary.
 */
export function checkoutConfirmationStatus(args: {
  status: unknown;
  paymentStatus: unknown;
}): CheckoutConfirmationStatus {
  if (args.status === "expired") return "expired";
  if (args.status === "complete" && args.paymentStatus === "paid") return "paid";
  if (args.status === "complete") return "processing";
  return "open";
}

function fullCaseRemainingCredits(
  priorRounds: unknown,
  currentCredits: unknown,
): number {
  const used = Array.isArray(priorRounds) ? priorRounds.length : 0;
  const includedRemaining = Math.max(0, config.fullCaseRoundsCap - used);
  const alreadyOwned = remainingFollowUpCredits({
    followUpCredits: currentCredits,
    fullCase: false,
    followUps: priorRounds,
  });
  // Never erase separately purchased, unused credits. Otherwise Full Case
  // tops the case up to its advertised 10-round lifetime cap.
  return Math.max(alreadyOwned, includedRemaining);
}

function recoveryEmailMessage(caseUrl: string): { subject: string; text: string; html: string } {
  const notice =
    "Your Stripe checkout session expired and no payment was made. Your appeal case " +
    "is available for up to 14 days from when you asked for reminders.";
  const disclaimer =
    "This is a transactional case-access notice, not a promise about an appeal outcome. " +
    "GetMyYes is a document drafting assistant — not medical, legal, or insurance advice.";
  return {
    subject: "Your GetMyYes checkout expired — no payment was made",
    text: `${notice}\n\nOpen your case: ${caseUrl}\n\n${disclaimer}`,
    html:
      `<p>${notice}</p>` +
      `<p><a href="${caseUrl}" style="background:#1C160C;color:#F3EDDF;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:700">Open my case</a></p>` +
      `<p style="color:#64748B;font-size:12px">${disclaimer}</p>`,
  };
}

/** Creates or safely resumes a hosted Stripe Checkout session. */
export const createCheckoutSession = onCall(
  { secrets: [stripeSecretKey], invoker: "public" },
  async (request) => {
    const uid = requireUid(request);
    const snap = await requireOwnedCase(request.data?.caseId, uid);
    const kind = parsePurchaseKind(request.data?.kind ?? "packet");
    if (!kind) throw new HttpsError("invalid-argument", "Unknown purchase kind.");

    const isInitialPurchase = kind === "packet" || kind === "packet_plus";
    if (isInitialPurchase && snap.get("paid") === true) {
      throw new HttpsError("already-exists", "This case is already unlocked.");
    }
    if (!isInitialPurchase && snap.get("paid") !== true) {
      throw new HttpsError(
        "failed-precondition",
        "Purchase the appeal packet before adding follow-up rounds.",
      );
    }
    if (kind === "full_case" && snap.get("fullCase") === true) {
      throw new HttpsError("already-exists", "Full Case is already active here.");
    }
    if (request.auth?.token.firebase.sign_in_provider === "anonymous") {
      throw new HttpsError(
        "failed-precondition",
        "Create an account before purchasing so your packet stays saved to it.",
      );
    }

    if (uid === ADMIN_UID) {
      const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
      if (isInitialPurchase) {
        update.paid = true;
        update.status = "paid";
        update.packetFulfillmentStatus = "pending";
        update.pricePaid = 0;
        update.followUpCredits = kind === "packet_plus"
          ? config.fullCaseRoundsCap
          : config.freeFollowUpRounds;
        if (kind === "packet_plus") update.fullCase = true;
        update.expiresAt = null;
      } else if (kind === "followup_round") {
        update.followUpCredits =
          remainingFollowUpCredits({
            followUpCredits: snap.get("followUpCredits"),
            fullCase: snap.get("fullCase"),
            followUps: snap.get("followUps"),
          }) + 1;
      } else {
        update.followUpCredits = fullCaseRemainingCredits(
          snap.get("followUps"),
          snap.get("followUpCredits"),
        );
        update.fullCase = true;
      }
      await snap.ref.update(update);
      return { checkoutUrl: null, comped: true };
    }

    const products = {
      packet: {
        amount: config.fullPacketPriceCents,
        name: "GetMyYes — Full Appeal Packet",
        description: "Appeal letter draft, evidence checklist, doctor letter request, call script, deadline checklist, PDF export. Includes " +
          `${config.freeFollowUpRounds} follow-up rounds.`,
      },
      packet_plus: {
        amount: config.fullCasePriceCents,
        name: "GetMyYes — Full Case (Packet + follow-ups)",
        description: "Everything in the Full Appeal Packet, plus up to " +
          `${config.fullCaseRoundsCap} follow-up drafting rounds for this case (capped, not unlimited).`,
      },
      followup_round: {
        amount: config.followUpRoundPriceCents,
        name: "GetMyYes — Follow-up Round",
        description: "One additional follow-up drafting round for your existing appeal case.",
      },
      full_case: {
        amount: config.fullCaseUpgradePriceCents,
        name: "GetMyYes — Full Case Upgrade",
        description: `Upgrade this case to up to ${config.fullCaseRoundsCap} follow-up drafting rounds (capped, not unlimited).`,
      },
    } as const;
    const product = products[kind];
    const stripe = stripeClient();
    const nowSeconds = Math.floor(Date.now() / 1000);
    const active = activeCheckout(snap.get("activeCheckout"));
    // A refresh/double-click returns the existing session rather than opening
    // another payable checkout. Other product kinds remain available for a
    // legitimate packet → $20 Full Case upgrade.
    if (active?.kind === kind && active.expiresAt > nowSeconds) {
      let existing: Stripe.Checkout.Session | null = null;
      try {
        existing = await stripe.checkout.sessions.retrieve(active.sessionId);
      } catch {
        // A stale Stripe session is safe to replace.
      }
      if (existing?.status === "open" && existing.url && (existing.expires_at ?? 0) > nowSeconds) {
        return { checkoutUrl: existing.url, sessionId: existing.id, reused: true };
      }
      // A browser can retry this callable after Checkout has collected the
      // payment but before Stripe's webhook arrives. Reconcile the
      // Stripe-authoritative paid session here instead of creating a second
      // payable session (and relying on a later duplicate refund). Do not
      // catch this fulfillment path: a transient backend error must surface
      // for a safe retry, never make another session payable.
      if (existing?.status === "complete" && existing.payment_status === "paid") {
        await handleCompletedCheckout(existing);
        return { checkoutUrl: null, sessionId: existing.id, completed: true };
      }
      // A delayed payment can be Checkout-complete before Stripe settles it.
      // Never sell a second session during that window: it can still become a
      // successful charge after the customer has started another checkout.
      if (existing?.status === "complete") {
        throw new HttpsError(
          "failed-precondition",
          "Your payment is still being confirmed. Please wait a moment before trying again.",
        );
      }
    }

    // Two callable invocations can both observe no active session before either
    // one reaches Stripe. Serialize a short-lived creation token in Firestore
    // and use it as Stripe's idempotency key, so both invocations resolve to
    // one payable Checkout session. Keeping the token through the creation
    // window also closes the gap between Stripe returning and activeCheckout
    // becoming visible to a caller that began from an older case snapshot.
    const checkoutCreationToken = await getFirestore().runTransaction(async (tx) => {
      const currentCase = await tx.get(snap.ref);
      if (!currentCase.exists || currentCase.get("ownerUid") !== uid) {
        throw new HttpsError("permission-denied", "Case not found.");
      }
      if (isInitialPurchase && currentCase.get("paid") === true) {
        throw new HttpsError("already-exists", "This case is already unlocked.");
      }
      if (!isInitialPurchase && currentCase.get("paid") !== true) {
        throw new HttpsError(
          "failed-precondition",
          "Purchase the appeal packet before adding follow-up rounds.",
        );
      }
      if (kind === "full_case" && currentCase.get("fullCase") === true) {
        throw new HttpsError("already-exists", "Full Case is already active here.");
      }

      const inProgress = checkoutCreation(currentCase.get("checkoutCreation"));
      if (inProgress && inProgress.expiresAt > nowSeconds) {
        if (inProgress.kind === kind) return inProgress.token;
        throw new HttpsError(
          "aborted",
          "Another checkout is already being prepared. Please wait a moment and try again.",
        );
      }
      const currentActive = activeCheckout(currentCase.get("activeCheckout"));
      if (currentActive && currentActive.expiresAt > nowSeconds &&
          currentActive.kind !== kind) {
        throw new HttpsError(
          "failed-precondition",
          "Finish or cancel the open checkout before choosing another package.",
        );
      }

      const token = randomUUID();
      tx.update(snap.ref, {
        checkoutCreation: {
          token,
          kind,
          expiresAt: nowSeconds + CHECKOUT_CREATION_TTL_SECONDS,
        },
        updatedAt: FieldValue.serverTimestamp(),
      });
      return token;
    });

    const email = (request.auth?.token.email as string | undefined) || undefined;
    const base = config.appBaseUrl;
    const returnPath = isInitialPurchase
      ? `/#/case/${snap.id}/purchase-success?session_id={CHECKOUT_SESSION_ID}`
      : `/#/case/${snap.id}/packet`;
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "usd",
            unit_amount: product.amount,
            product_data: { name: product.name, description: product.description },
          },
          quantity: 1,
        }],
        metadata: {
          caseId: snap.id,
          uid,
          kind,
          creationToken: checkoutCreationToken,
        },
        client_reference_id: snap.id,
        customer_email: email,
        success_url: `${base}${returnPath}`,
        cancel_url: `${base}/#/case/${snap.id}/${isInitialPurchase ? "preview" : "packet"}`,
        after_expiration: { recovery: { enabled: true, allow_promotion_codes: false } },
      },
      {
        idempotencyKey: `getmyyes-checkout-${kind}-${checkoutCreationToken}`,
      },
    );
    const stored = await getFirestore().runTransaction(async (tx) => {
      const currentCase = await tx.get(snap.ref);
      if (!currentCase.exists || currentCase.get("ownerUid") !== uid) return false;
      const currentCreation = checkoutCreation(currentCase.get("checkoutCreation"));
      if (currentCreation?.token !== checkoutCreationToken ||
          currentCreation.kind !== kind) return false;
      if ((isInitialPurchase && currentCase.get("paid") === true) ||
          (!isInitialPurchase && currentCase.get("paid") !== true) ||
          (kind === "full_case" && currentCase.get("fullCase") === true)) {
        return false;
      }
      tx.update(snap.ref, {
        stripeSessionId: session.id,
        activeCheckout: {
          sessionId: session.id,
          kind,
          expiresAt: session.expires_at ?? nowSeconds + 24 * 3600,
        },
        // Stripe normally delivers the completion webhook within seconds. This
        // due timestamp is a bounded safety net for a missing/misconfigured
        // webhook; successful webhook fulfillment removes it before it is due.
        checkoutReconciliationAt: Timestamp.fromMillis(
          Date.now() + CHECKOUT_RECONCILIATION_INITIAL_DELAY_MS,
        ),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return true;
    });
    if (!stored) {
      // A concurrent completion or package change won the Firestore race.
      // Prevent the now-detached open session from remaining payable.
      try {
        if (session.status === "open") await stripe.checkout.sessions.expire(session.id);
      } catch {
        // A session that completed during this race is handled idempotently by
        // its webhook/reconciliation event.
      }
      throw new HttpsError(
        "aborted",
        "Checkout state changed while the payment page was opening. Please try again.",
      );
    }
    if (isInitialPurchase) await recordFirstCaseAnalyticsEvent(uid, snap.ref, "checkout_started");
    await recordFirstCaseAnalyticsEvent(uid, snap.ref, "checkout_created");
    await recordFirstCaseMonetizationEvent(
      uid,
      snap.ref,
      kind,
      "checkout_created",
    );
    return { checkoutUrl: session.url, sessionId: session.id };
  },
);

/**
 * Reconcile the exact Checkout session Stripe placed on our success URL.
 * This closes the customer-visible gap when webhook delivery is delayed:
 * a paid customer can receive the entitlement immediately instead of waiting
 * for the five-minute scheduled watchdog. Ownership is checked both against
 * Firestore and immutable Checkout metadata before any payment is applied.
 */
export const confirmCheckoutSession = onCall(
  { secrets: [stripeSecretKey], invoker: "public" },
  async (request) => {
    const uid = requireUid(request);
    const caseSnap = await requireOwnedCase(request.data?.caseId, uid);
    const sessionId = stripeCheckoutSessionId(request.data?.sessionId);
    if (!sessionId) {
      throw new HttpsError("invalid-argument", "Invalid Checkout session.");
    }

    const session = await stripeClient().checkout.sessions.retrieve(sessionId);
    const sessionCaseId = session.metadata?.caseId ?? session.client_reference_id;
    if (sessionCaseId !== caseSnap.id || session.metadata?.uid !== uid) {
      throw new HttpsError(
        "permission-denied",
        "This Checkout session does not belong to this case.",
      );
    }

    const status = checkoutConfirmationStatus({
      status: session.status,
      paymentStatus: session.payment_status,
    });
    if (status === "paid") {
      // The same idempotent fulfillment path is shared by the webhook,
      // scheduled reconciliation, and this customer-return recovery.
      await handleCompletedCheckout(session);
    }
    return { status };
  },
);

async function handleCompletedCheckout(session: Stripe.Checkout.Session): Promise<void> {
  // `checkout.session.completed` can precede settlement for delayed methods.
  // Entitlements are granted only after Stripe says this session is paid.
  if (session.payment_status !== "paid") return;
  const caseId = session.metadata?.caseId ?? session.client_reference_id;
  if (!caseId) return;
  const kind = parsePurchaseKind(session.metadata?.kind) ?? "packet";
  const buyerEmail = session.customer_details?.email ?? session.customer_email ?? null;
  const db = getFirestore();
  const caseRef = db.collection("cases").doc(caseId);
  const purchaseRef = db.collection("purchases").doc(session.id);
  const mailRef = db.collection("mail").doc();
  const paymentIntentId = stripeObjectId(session.payment_intent);

  const result = await db.runTransaction(async (tx) => {
    const [caseSnap, purchaseSnap] = await Promise.all([tx.get(caseRef), tx.get(purchaseRef)]);
    if (!caseSnap.exists) {
      // A customer can delete a case while Checkout is open. Record the money
      // movement, then refund it; the product cannot be delivered safely.
      if (!purchaseSnap.exists) {
        tx.set(purchaseRef, {
          uid: session.metadata?.uid ?? null,
          caseId,
          kind,
          email: buyerEmail,
          amount: (session.amount_total ?? 0) / 100,
          currency: session.currency ?? "usd",
          paymentIntentId,
          stripeSessionId: session.id,
          status: "orphaned_pending_refund",
          refundStatus: "pending",
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      return {
        applied: false,
        repairInitialSideEffects: false,
        ownerUid: null,
        duplicate: false,
        refundPending: !purchaseSnap.exists || purchaseSnap.get("refundStatus") === "pending",
        refundReason: refundReason(purchaseSnap.get("refundReason")) ?? "requested_by_customer",
        paymentIntentId: purchaseSnap.exists
          ? purchaseSnap.get("paymentIntentId") as string | null
          : paymentIntentId,
      };
    }
    const ownerUid = caseSnap.get("ownerUid") as string | null;
    const active = activeCheckout(caseSnap.get("activeCheckout"));
    const creation = checkoutCreation(caseSnap.get("checkoutCreation"));
    const sessionCreationToken =
      stripeCheckoutCreationToken(session.metadata?.creationToken);
    const recoveredFromSessionId = recoveredCheckoutSessionId(session);
    const isRecovered = recoveredFromSessionId !== null;
    const clearsCurrentCheckout =
      active?.sessionId === session.id ||
      recoveredFromSessionId === active?.sessionId ||
      (Boolean(sessionCreationToken) &&
        creation?.token === sessionCreationToken &&
        creation.kind === kind);
    const clearCheckoutState = clearsCurrentCheckout
      ? {
          activeCheckout: FieldValue.delete(),
          checkoutCreation: FieldValue.delete(),
        }
      : {};
    if (purchaseSnap.exists) {
      const completedInitialPurchase =
        purchaseSnap.get("status") === "completed" &&
        (purchaseSnap.get("kind") === "packet" ||
          purchaseSnap.get("kind") === "packet_plus") &&
        caseSnap.get("paid") === true;
      if (clearsCurrentCheckout) {
        tx.update(caseRef, {
          ...clearCheckoutState,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      return {
        applied: false,
        // A downstream, idempotent attribution/notification write can fail
        // after this purchase transaction commits. Stripe redelivery then
        // repairs those writes without treating the payment as a duplicate.
        repairInitialSideEffects: completedInitialPurchase,
        ownerUid,
        duplicate: purchaseSnap.get("status") === "duplicate_pending_refund",
        refundPending: purchaseSnap.get("refundStatus") === "pending",
        refundReason: refundReason(purchaseSnap.get("refundReason")),
        paymentIntentId: purchaseSnap.get("paymentIntentId") as string | null,
      };
    }

    const isInitialPurchase = kind === "packet" || kind === "packet_plus";
    const duplicate =
      // A packet_plus session completing after a packet is already paid is not
      // an upgrade: the only supported upgrade is the $20 full_case product.
      (isInitialPurchase && caseSnap.get("paid") === true) ||
      // packet_plus already includes Full Case, so any later upgrade session
      // is also a duplicate even when it predates this schema marker.
      (kind === "full_case" && caseSnap.get("fullCase") === true) ||
      // Stripe creates a new session for its own recovery flow. If the
      // expired-event webhook is delayed, its old session can still be stored
      // here; that must not turn the recovered paid session into a refund.
      (active?.kind === kind && active.sessionId !== session.id && !isRecovered);
    const invalidState =
      (isInitialPurchase && caseSnap.get("paid") === true && !duplicate) ||
      (!isInitialPurchase && caseSnap.get("paid") !== true);
    if (!duplicate && !invalidState) {
      if (isInitialPurchase) {
        tx.update(caseRef, {
          paid: true,
          status: "paid",
          packetFulfillmentStatus: "pending",
          pricePaid: (session.amount_total ?? 0) / 100,
          stripeSessionId: session.id,
          initialPurchaseKind: kind,
          followUpCredits: kind === "packet_plus" ? config.fullCaseRoundsCap : config.freeFollowUpRounds,
          ...(kind === "packet_plus" ? { fullCase: true } : {}),
          expiresAt: null,
          ...clearCheckoutState,
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else if (kind === "followup_round") {
        tx.update(caseRef, {
          followUpCredits: remainingFollowUpCredits({
            followUpCredits: caseSnap.get("followUpCredits"),
            fullCase: caseSnap.get("fullCase"),
            followUps: caseSnap.get("followUps"),
          }) + 1,
          stripeSessionId: session.id,
          ...clearCheckoutState,
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        tx.update(caseRef, {
          followUpCredits: fullCaseRemainingCredits(
            caseSnap.get("followUps"),
            caseSnap.get("followUpCredits"),
          ),
          fullCase: true,
          fullCasePurchaseKind: "full_case",
          stripeSessionId: session.id,
          ...clearCheckoutState,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    const refundPending = duplicate || invalidState;
    const pendingRefundReason: RefundReason | null = duplicate
      ? "duplicate"
      : invalidState
        ? "requested_by_customer"
        : null;
    tx.set(purchaseRef, {
      uid: ownerUid,
      caseId,
      kind,
      email: buyerEmail,
      amount: (session.amount_total ?? 0) / 100,
      currency: session.currency ?? "usd",
      paymentIntentId,
      stripeSessionId: session.id,
      status: duplicate
        ? "duplicate_pending_refund"
        : invalidState
          ? "invalid_state_pending_refund"
          : "completed",
      ...(refundPending
        ? { refundStatus: "pending", refundReason: pendingRefundReason }
        : {}),
      createdAt: FieldValue.serverTimestamp(),
    });

    const applied = !duplicate && !invalidState;
    if (applied && buyerEmail) {
      const packetUrl = isInitialPurchase
        ? `${config.appBaseUrl}/#/case/${caseId}/purchase-success`
        : `${config.appBaseUrl}/#/case/${caseId}/packet`;
      const what = kind === "packet"
        ? "Full Appeal Packet"
        : kind === "packet_plus"
          ? `Full Case (packet + up to ${config.fullCaseRoundsCap} follow-up drafting rounds)`
          : kind === "full_case"
            ? `Full Case upgrade (up to ${config.fullCaseRoundsCap} follow-up drafting rounds)`
            : "additional follow-up drafting round";
      tx.set(mailRef, {
        caseId,
        ownerUid,
        to: [buyerEmail],
        message: {
          subject: isInitialPurchase
            ? "Your GetMyYes appeal packet is unlocked"
            : "Your GetMyYes follow-up purchase is active",
          text: `Thanks for your purchase! Your ${what} is active.\n\nOpen your case any time: ${packetUrl}\n\n` +
            "Sign in with the account you used at checkout to access it. Questions? Reply to this email.\n\n" +
            "GetMyYes is a document drafting assistant — not medical, legal, or insurance advice. Review every document before sending.",
          html: "<h2>You're all set</h2>" +
            `<p>Thanks for your purchase! Your <strong>${what}</strong> is active.</p>` +
            `<p><a href="${packetUrl}" style="background:#2563EB;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:700">Open my case</a></p>` +
            "<p>Sign in with the account you used at checkout to access it any time.</p>" +
            "<p style=\"color:#64748B;font-size:12px\">GetMyYes is a document drafting assistant — not medical, legal, or insurance advice. Review every document before sending.</p>",
        },
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    return {
      applied,
      repairInitialSideEffects: applied && isInitialPurchase,
      ownerUid,
      duplicate,
      refundPending,
      refundReason: pendingRefundReason,
      paymentIntentId,
    };
  });

  if (result.repairInitialSideEffects) {
    await recordFirstCaseAnalyticsEvent(result.ownerUid, caseRef, "paid");
    // Acquisition credit is a conversion metric, so it belongs only to the
    // completed initial entitlement. This runs server-side: when a transient
    // write fails, the webhook throws and Stripe retries this completed
    // purchase path. The helper is idempotent and deletes the source category
    // after it contributes to the aggregate.
    await recordFirstPaidAcquisitionAttribution(result.ownerUid, caseRef);
    await scheduleFeedbackRequest({
      caseId,
      ownerUid: result.ownerUid,
      email: buyerEmail,
    });
  }
  if (result.applied && recoveredCheckoutSession(session)) {
    await recordFirstCaseAnalyticsEvent(result.ownerUid, caseRef, "checkout_recovered");
    await recordFirstCaseMonetizationEvent(
      result.ownerUid,
      caseRef,
      kind,
      "checkout_recovered",
    );
  }
  if (result.duplicate) await recordFirstCaseAnalyticsEvent(result.ownerUid, caseRef, "checkout_duplicate");
  // A completed Checkout charge is a payment movement even when it is a
  // duplicate/invalid entitlement that will be refunded. Recording it before
  // the refund keeps net product revenue at zero rather than negative.
  if (result.ownerUid) {
    await recordFirstPurchaseMonetizationEvent(
      result.ownerUid,
      purchaseRef,
      kind,
      "paid",
      session.amount_total ?? 0,
    );
  }
  if (result.refundPending) {
    try {
      const refundIntent = result.paymentIntentId ?? paymentIntentId;
      if (!refundIntent) {
        await purchaseRef.update({
          refundStatus: "manual_review",
          refundFailedAt: FieldValue.serverTimestamp(),
        });
        await updateCheckoutReconciliation(caseRef, session.id, null);
        return;
      }
      const reason = result.refundReason ?? "requested_by_customer";
      const refund = await stripeClient().refunds.create(
        { payment_intent: refundIntent, reason },
        {
          idempotencyKey: reason === "duplicate"
            ? `getmyyes-duplicate-${session.id}`
          : `getmyyes-invalid-state-${session.id}`,
        },
      );
      if (refund.status === "succeeded") {
        await purchaseRef.update({
          refundStatus: "refunded",
          stripeRefundId: refund.id,
          refundCents: refund.amount,
          refundedAt: FieldValue.serverTimestamp(),
        });
        await recordPurchaseRefundMonetizationEvent(
          result.ownerUid,
          purchaseRef,
          kind,
          refund.id,
          refund.amount,
        );
      } else if (refund.status === "pending" || refund.status === "requires_action") {
        // Stripe can accept a refund before it is actually settled. The
        // refund.updated webhook records revenue only once it succeeds.
        await purchaseRef.update({
          refundStatus: "pending",
          stripeRefundId: refund.id,
          refundRequestedAt: FieldValue.serverTimestamp(),
        });
      } else {
        await purchaseRef.update({
          refundStatus: "manual_review",
          stripeRefundId: refund.id,
          refundFailedAt: FieldValue.serverTimestamp(),
        });
        // A declined/canceled refund is not retryable with the same idempotency
        // key. Preserve it for support rather than overwriting manual_review
        // in the transient-error retry path below.
        await updateCheckoutReconciliation(caseRef, session.id, null);
        return;
      }
    } catch {
      await purchaseRef.update({
        // Leave this session retryable. Throwing gives Stripe a webhook retry;
        // a successful retry is idempotent at both Stripe and Firestore.
        refundStatus: "pending",
        refundFailedAt: FieldValue.serverTimestamp(),
        refundAttempts: FieldValue.increment(1),
      });
      throw new Error("Stripe refund attempt failed");
    }
  }
  if (result.applied && result.ownerUid && !isAdminAnalyticsUid(result.ownerUid)) {
    await bumpUserDaily(result.ownerUid, { revenueCents: session.amount_total ?? 0 });
  }
  await updateCheckoutReconciliation(caseRef, session.id, null);
}

/**
 * Change only the reconciliation marker that still belongs to this Checkout
 * session. A late scheduled invocation must never clear or postpone a newer
 * purchase attempt stored on the same case.
 */
async function updateCheckoutReconciliation(
  caseRef: DocumentReference,
  expectedSessionId: string | null,
  nextAt: Timestamp | null,
): Promise<void> {
  const db = getFirestore();
  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(caseRef);
    if (!current.exists) return;
    const active = activeCheckout(current.get("activeCheckout"));
    const storedSessionId = stripeCheckoutSessionId(current.get("stripeSessionId"));
    if (expectedSessionId === null) {
      if (stripeCheckoutSessionId(active?.sessionId) || storedSessionId) return;
    } else if (active?.sessionId !== expectedSessionId &&
        storedSessionId !== expectedSessionId) {
      return;
    }
    transaction.update(caseRef, {
      checkoutReconciliationAt: nextAt ?? FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

/**
 * Reconcile Stripe Dashboard/API refunds as well as refunds initiated by this
 * service. A refund can be partial and Stripe can deliver both created and
 * updated events, so the nested refund document is the durable idempotency
 * marker while the parent keeps a compact cumulative status for support.
 */
async function handleSucceededRefund(refund: Stripe.Refund): Promise<void> {
  if (refund.status !== "succeeded") return;
  const paymentIntentId = stripeObjectId(refund.payment_intent);
  const refundCents = safePositiveCents(refund.amount);
  if (!paymentIntentId || !refundCents) return;

  const db = getFirestore();
  const matches = await db.collection("purchases")
    .where("paymentIntentId", "==", paymentIntentId)
    .limit(5)
    .get();
  for (const purchaseRef of matches.docs.map((doc) => doc.ref)) {
    const result = await db.runTransaction(async (transaction) => {
      const [purchase, priorRefund] = await Promise.all([
        transaction.get(purchaseRef),
        transaction.get(purchaseRef.collection("refunds").doc(refund.id)),
      ]);
      if (!purchase.exists) return null;
      const uid = purchase.get("uid");
      const kind = parsePurchaseKind(purchase.get("kind"));
      const purchaseCents = storedAmountCents(purchase.get("amount"));
      if (typeof uid !== "string" || !kind || !purchaseCents) return null;
      if (!priorRefund.exists) {
        const recordedCents = safePositiveCents(purchase.get("refundCents")) ?? 0;
        const cumulativeCents = Math.min(purchaseCents, recordedCents + refundCents);
        transaction.set(purchaseRef.collection("refunds").doc(refund.id), {
          stripeRefundId: refund.id,
          amountCents: refundCents,
          status: "succeeded",
          createdAt: FieldValue.serverTimestamp(),
        });
        transaction.update(purchaseRef, {
          refundStatus: cumulativeCents >= purchaseCents ? "refunded" : "partially_refunded",
          refundCents: cumulativeCents,
          stripeRefundId: refund.id,
          refundedAt: FieldValue.serverTimestamp(),
        });
      }
      return { uid, kind };
    });
    if (result) {
      await recordPurchaseRefundMonetizationEvent(
        result.uid,
        purchaseRef,
        result.kind,
        refund.id,
        refundCents,
      );
    }
  }
}

/** Keep a failed asynchronous refund visibly actionable without subtracting it. */
async function handleFailedRefund(refund: Stripe.Refund): Promise<void> {
  const paymentIntentId = stripeObjectId(refund.payment_intent);
  if (!paymentIntentId) return;
  const db = getFirestore();
  const matches = await db.collection("purchases")
    .where("paymentIntentId", "==", paymentIntentId)
    .limit(5)
    .get();
  for (const purchaseRef of matches.docs.map((doc) => doc.ref)) {
    await db.runTransaction(async (transaction) => {
      const [purchase, priorRefund] = await Promise.all([
        transaction.get(purchaseRef),
        transaction.get(purchaseRef.collection("refunds").doc(refund.id)),
      ]);
      if (!purchase.exists || priorRefund.get("status") === "succeeded") return;
      transaction.set(purchaseRef.collection("refunds").doc(refund.id), {
        stripeRefundId: refund.id,
        status: "failed",
        failedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      if (purchase.get("stripeRefundId") === refund.id ||
          purchase.get("refundStatus") === "pending") {
        transaction.update(purchaseRef, {
          refundStatus: "manual_review",
          refundFailedAt: FieldValue.serverTimestamp(),
        });
      }
    });
  }
}

/**
 * Safety net for accepted but asynchronous refunds. This is intentionally
 * bounded and reads only the fixed Stripe refund id stored on the purchase,
 * so a missing Dashboard `refund.*` subscription cannot leave a charge
 * permanently marked pending. Manual-review records without a Stripe refund
 * id still require a person: there is no safe payment to retrieve.
 */
export const reconcileStripeRefunds = onSchedule(
  {
    schedule: "every 30 minutes",
    secrets: [stripeSecretKey],
    retryCount: 1,
    timeoutSeconds: 120,
  },
  async () => {
    const db = getFirestore();
    const [pending, manual] = await Promise.all([
      db.collection("purchases")
        .where("refundStatus", "==", "pending")
        .limit(PENDING_REFUND_RECONCILIATION_LIMIT)
        .get(),
      db.collection("purchases")
        .where("refundStatus", "==", "manual_review")
        .limit(MANUAL_REFUND_RECONCILIATION_LIMIT)
        .get(),
    ]);
    const candidates = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    for (const snapshot of [pending, manual]) {
      for (const purchase of snapshot.docs) candidates.set(purchase.id, purchase);
    }

    let checked = 0;
    for (const purchase of candidates.values()) {
      const data = purchase.data();
      if (!refundNeedsReconciliation({
        refundStatus: data.refundStatus,
        stripeRefundId: data.stripeRefundId,
      })) continue;
      checked += 1;
      try {
        const refund = await stripeClient().refunds.retrieve(data.stripeRefundId as string);
        if (refund.status === "succeeded") {
          await handleSucceededRefund(refund);
        } else if (refund.status === "failed" || refund.status === "canceled") {
          await handleFailedRefund(refund);
        }
      } catch {
        // A Stripe read failure must not turn a still-valid refund into a
        // failure. The next bounded run retries it, and no error payload is
        // persisted with customer data.
      }
    }
    console.log(`Stripe refund reconciliation checked ${checked}/${candidates.size} purchase(s).`);
  },
);

/**
 * Checkout completion safety net. Stripe webhooks remain the fast path; this
 * bounded poller repairs paid sessions whose event subscription or delivery
 * failed, so a customer cannot be charged without receiving the entitlement.
 * Open/delayed sessions are moved to the back of the due queue.
 */
export const reconcileStripeCheckouts = onSchedule(
  {
    schedule: "every 5 minutes",
    secrets: [stripeSecretKey],
    timeoutSeconds: 120,
  },
  async () => {
    const db = getFirestore();
    const due = await db.collection("cases")
      .where("checkoutReconciliationAt", "<=", Timestamp.now())
      .limit(CHECKOUT_RECONCILIATION_LIMIT)
      .get();
    const stripe = stripeClient();
    let checked = 0;
    let repaired = 0;

    for (const candidate of due.docs) {
      const active = activeCheckout(candidate.get("activeCheckout"));
      const sessionId =
        stripeCheckoutSessionId(active?.sessionId) ??
        stripeCheckoutSessionId(candidate.get("stripeSessionId"));
      if (!sessionId) {
        await updateCheckoutReconciliation(candidate.ref, null, null);
        continue;
      }
      checked += 1;
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.status === "complete" && session.payment_status === "paid") {
          await handleCompletedCheckout(session);
          repaired += 1;
        } else if (session.status === "expired") {
          await handleExpiredCheckout(session);
        } else {
          await updateCheckoutReconciliation(
            candidate.ref,
            sessionId,
            Timestamp.fromMillis(Date.now() + CHECKOUT_RECONCILIATION_RECHECK_MS),
          );
        }
      } catch {
        // Stripe reads and downstream fulfillment are safely retryable. Keep
        // the case in the bounded queue without storing payment error details.
        await updateCheckoutReconciliation(
          candidate.ref,
          sessionId,
          Timestamp.fromMillis(Date.now() + CHECKOUT_RECONCILIATION_RECHECK_MS),
        );
      }
    }
    console.log(
      `Stripe Checkout reconciliation checked ${checked}/${due.size}; repaired ${repaired}.`,
    );
  },
);

async function handleExpiredCheckout(session: Stripe.Checkout.Session): Promise<void> {
  const caseId = session.metadata?.caseId ?? session.client_reference_id;
  if (!caseId) return;
  const sessionKind = parsePurchaseKind(session.metadata?.kind);
  const db = getFirestore();
  const caseRef = db.collection("cases").doc(caseId);
  const mailRef = db.collection("mail").doc();
  const result = await db.runTransaction(async (tx) => {
    const caseSnap = await tx.get(caseRef);
    if (!caseSnap.exists) return { expired: false, ownerUid: null, kind: null };
    const active = activeCheckout(caseSnap.get("activeCheckout"));
    const creation = checkoutCreation(caseSnap.get("checkoutCreation"));
    const sessionCreationToken =
      stripeCheckoutCreationToken(session.metadata?.creationToken);
    const clearsCreation =
      Boolean(sessionCreationToken) && creation?.token === sessionCreationToken;
    const kind = sessionKind ?? active?.kind ?? null;
    const isInitialPurchase = kind === "packet" || kind === "packet_plus";
    // A late expiry for the already-paid initial package must not undo or
    // message a customer. Paid add-on sessions, however, still need their
    // active state cleared and their lifecycle counted.
    if (caseSnap.get("paid") === true && (isInitialPurchase || !kind)) {
      return { expired: false, ownerUid: null, kind: null };
    }
    if (active?.sessionId !== session.id && caseSnap.get("stripeSessionId") !== session.id) {
      return { expired: false, ownerUid: null, kind: null };
    }
    const reminderEmail = caseSnap.get("reminderEmail");
    const shouldQueueRecovery =
      typeof reminderEmail === "string" &&
      EMAIL_RE.test(reminderEmail) &&
      caseSnap.get("reminderOptInAt") != null &&
      caseSnap.get("checkoutRecoveryEmailSessionId") !== session.id;
    tx.update(caseRef, {
      activeCheckout: FieldValue.delete(),
      ...(clearsCreation ? { checkoutCreation: FieldValue.delete() } : {}),
      checkoutReconciliationAt: FieldValue.delete(),
      checkoutExpiredAt: FieldValue.serverTimestamp(),
      ...(shouldQueueRecovery ? { checkoutRecoveryEmailSessionId: session.id } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (shouldQueueRecovery) {
      const casePath = isInitialPurchase ? "preview" : "packet";
      tx.set(mailRef, {
        caseId,
        ownerUid: caseSnap.get("ownerUid") as string | null,
        to: [reminderEmail],
        message: recoveryEmailMessage(`${config.appBaseUrl}/#/case/${caseId}/${casePath}`),
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    return {
      expired: true,
      ownerUid: caseSnap.get("ownerUid") as string | null,
      kind,
    };
  });
  if (result.expired) {
    await recordFirstCaseAnalyticsEvent(result.ownerUid, caseRef, "checkout_expired");
    await recordFirstCaseMonetizationEvent(
      result.ownerUid,
      caseRef,
      result.kind,
      "checkout_expired",
    );
  }
}

async function handleAsyncPaymentFailed(session: Stripe.Checkout.Session): Promise<void> {
  const caseId = session.metadata?.caseId ?? session.client_reference_id;
  if (!caseId) return;
  const sessionKind = parsePurchaseKind(session.metadata?.kind);
  const caseRef = getFirestore().collection("cases").doc(caseId);
  await getFirestore().runTransaction(async (tx) => {
    const caseSnap = await tx.get(caseRef);
    if (!caseSnap.exists) return;
    const active = activeCheckout(caseSnap.get("activeCheckout"));
    const creation = checkoutCreation(caseSnap.get("checkoutCreation"));
    const sessionCreationToken =
      stripeCheckoutCreationToken(session.metadata?.creationToken);
    const clearsCreation =
      Boolean(sessionCreationToken) && creation?.token === sessionCreationToken;
    const kind = sessionKind ?? active?.kind ?? null;
    const isInitialPurchase = kind === "packet" || kind === "packet_plus";
    if (caseSnap.get("paid") === true && (isInitialPurchase || !kind)) return;
    if (active?.sessionId !== session.id &&
        caseSnap.get("stripeSessionId") !== session.id) return;
    tx.update(caseRef, {
      activeCheckout: FieldValue.delete(),
      ...(clearsCreation ? { checkoutCreation: FieldValue.delete() } : {}),
      checkoutReconciliationAt: FieldValue.delete(),
      checkoutPaymentFailedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

/** Verifies Stripe signatures and applies only trusted Checkout state changes. */
export const stripeWebhook = onRequest(
  { secrets: [stripeSecretKey, stripeWebhookSecret], invoker: "public" },
  async (req, res) => {
    const whSecret = stripeWebhookSecret.value() || process.env.STRIPE_WEBHOOK_SECRET;
    if (!whSecret) {
      res.status(500).send("Webhook secret not configured");
      return;
    }
    let event: Stripe.Event;
    try {
      event = stripeClient().webhooks.constructEvent(
        req.rawBody,
        req.headers["stripe-signature"] as string,
        whSecret,
      );
    } catch {
      res.status(400).send("Webhook signature verification failed");
      return;
    }
    if (event.type === "checkout.session.completed") {
      await handleCompletedCheckout(event.data.object as Stripe.Checkout.Session);
    } else if (event.type === "checkout.session.async_payment_succeeded") {
      await handleCompletedCheckout(event.data.object as Stripe.Checkout.Session);
    } else if (event.type === "checkout.session.async_payment_failed") {
      await handleAsyncPaymentFailed(event.data.object as Stripe.Checkout.Session);
    } else if (event.type === "checkout.session.expired") {
      await handleExpiredCheckout(event.data.object as Stripe.Checkout.Session);
    } else if (event.type === "refund.created" || event.type === "refund.updated") {
      await handleSucceededRefund(event.data.object as Stripe.Refund);
    } else if (event.type === "refund.failed") {
      await handleFailedRefund(event.data.object as Stripe.Refund);
    }
    res.status(200).send({ received: true });
  },
);
