import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import Stripe from "stripe";
import { config, stripeSecretKey, stripeWebhookSecret } from "./config";
import { requireUid, requireOwnedCase } from "./util";

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

/**
 * createCheckoutSession
 * Web checkout for the $39 Full Appeal Packet. Returns the hosted Checkout
 * URL; the client redirects to it. Mobile builds show the paywall UI but use
 * the PaymentService abstraction (IAP/RevenueCat to be added later).
 */
export const createCheckoutSession = onCall(
  { secrets: [stripeSecretKey], invoker: "public" },
  async (request) => {
    const uid = requireUid(request);
    const snap = await requireOwnedCase(request.data?.caseId, uid);
    if (snap.get("paid") === true) {
      throw new HttpsError("already-exists", "This case is already unlocked.");
    }

    const stripe = stripeClient();
    const base = config.appBaseUrl;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: config.fullPacketPriceCents,
            product_data: {
              name: "ClaimHelper — Full Appeal Packet",
              description:
                "Appeal letter draft, evidence checklist, doctor letter request, call script, deadline checklist, PDF export.",
            },
          },
          quantity: 1,
        },
      ],
      metadata: { caseId: snap.id, uid },
      client_reference_id: snap.id,
      success_url: `${base}/#/case/${snap.id}/purchase-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/#/case/${snap.id}/preview`,
    });

    await snap.ref.update({
      stripeSessionId: session.id,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { checkoutUrl: session.url, sessionId: session.id };
  },
);

/**
 * stripeWebhook
 * Verifies the Stripe signature and marks the case paid on
 * checkout.session.completed. This is the ONLY code path that can set
 * paid=true (Firestore rules block client writes to that field).
 */
export const stripeWebhook = onRequest(
  {
    secrets: [stripeSecretKey, stripeWebhookSecret],
    // Stripe calls this endpoint unauthenticated; security comes from Stripe
    // signature verification below, so it must allow public invocation.
    invoker: "public",
  },
  async (req, res) => {
    const whSecret = stripeWebhookSecret.value() || process.env.STRIPE_WEBHOOK_SECRET;
    if (!whSecret) {
      res.status(500).send("Webhook secret not configured");
      return;
    }

    let event: Stripe.Event;
    try {
      const signature = req.headers["stripe-signature"] as string;
      event = stripeClient().webhooks.constructEvent(req.rawBody, signature, whSecret);
    } catch (err) {
      res.status(400).send(`Webhook signature verification failed`);
      return;
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const caseId = session.metadata?.caseId ?? session.client_reference_id;
      const uid = session.metadata?.uid ?? null;
      if (caseId) {
        const db = getFirestore();
        const caseRef = db.collection("cases").doc(caseId);
        await db.runTransaction(async (tx) => {
          const caseSnap = await tx.get(caseRef);
          if (!caseSnap.exists || caseSnap.get("paid") === true) return;
          tx.update(caseRef, {
            paid: true,
            status: "paid",
            pricePaid: (session.amount_total ?? 0) / 100,
            stripeSessionId: session.id,
            // Paid cases must survive the 24h cleanup even without an account.
            expiresAt: null,
            updatedAt: FieldValue.serverTimestamp(),
          });
          tx.set(db.collection("purchases").doc(session.id), {
            uid,
            caseId,
            amount: (session.amount_total ?? 0) / 100,
            currency: session.currency ?? "usd",
            status: "completed",
            stripeSessionId: session.id,
            createdAt: FieldValue.serverTimestamp(),
          });
        });
      }
    }

    res.status(200).send({ received: true });
  },
);
