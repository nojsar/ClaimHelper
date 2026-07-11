import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import Stripe from "stripe";
import { ADMIN_UID, config, stripeSecretKey, stripeWebhookSecret } from "./config";
import { requireUid, requireOwnedCase } from "./util";
import { bumpDaily } from "./analytics";

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

    const kind = (request.data?.kind as string | undefined) ?? "packet";
    if (!["packet", "packet_plus", "followup_round", "full_case"].includes(kind)) {
      throw new HttpsError("invalid-argument", "Unknown purchase kind.");
    }
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
    // Purchases require a real account: an anonymous uid is unrecoverable if
    // the browser session is lost, which would orphan a paid packet. The
    // client shows an account sheet when it sees this error.
    if (request.auth?.token.firebase.sign_in_provider === "anonymous") {
      throw new HttpsError(
        "failed-precondition",
        "Create an account before purchasing so your packet stays saved to it.",
      );
    }
    const email = (request.auth?.token.email as string | undefined) || undefined;

    // Owner account: skip Stripe entirely and apply the entitlement directly
    // (comped). The client already treats a null checkoutUrl as "resolved
    // instantly". Deliberately no funnel/revenue counters on this path.
    if (uid === ADMIN_UID) {
      const update: Record<string, unknown> = {
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (isInitialPurchase) {
        update.paid = true;
        update.status = "paid";
        update.pricePaid = 0;
        update.followUpCredits =
          kind === "packet_plus"
            ? config.fullCaseRoundsCap
            : config.freeFollowUpRounds;
        if (kind === "packet_plus") update.fullCase = true;
        update.expiresAt = null;
      } else if (kind === "followup_round") {
        const current =
          (snap.get("followUpCredits") as number | undefined) ??
          config.freeFollowUpRounds;
        update.followUpCredits = current + 1;
      } else {
        update.followUpCredits = config.fullCaseRoundsCap;
        update.fullCase = true;
      }
      await snap.ref.update(update);
      return { checkoutUrl: null, comped: true };
    }

    const products = {
      packet: {
        amount: config.fullPacketPriceCents,
        name: "GetMyYes — Full Appeal Packet",
        description:
          "Appeal letter draft, evidence checklist, doctor letter request, " +
          `call script, deadline checklist, PDF export. Includes ${config.freeFollowUpRounds} follow-up rounds.`,
      },
      packet_plus: {
        amount: config.fullCasePriceCents,
        name: "GetMyYes — Full Case (Packet + follow-ups)",
        description:
          "Everything in the Full Appeal Packet, plus up to " +
          `${config.fullCaseRoundsCap} follow-up rounds until your case is resolved (capped, not unlimited).`,
      },
      followup_round: {
        amount: config.followUpRoundPriceCents,
        name: "GetMyYes — Follow-up Round",
        description:
          "One additional follow-up assistance round for your existing appeal case.",
      },
      full_case: {
        amount: config.fullCasePriceCents,
        name: "GetMyYes — Full Case Upgrade",
        description:
          `Up to ${config.fullCaseRoundsCap} follow-up rounds for this case (capped, not unlimited).`,
      },
    } as const;
    const product = products[kind as keyof typeof products];

    const stripe = stripeClient();
    const base = config.appBaseUrl;
    const returnPath = isInitialPurchase
      ? `/#/case/${snap.id}/purchase-success?session_id={CHECKOUT_SESSION_ID}`
      : `/#/case/${snap.id}/packet`;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: product.amount,
            product_data: {
              name: product.name,
              description: product.description,
            },
          },
          quantity: 1,
        },
      ],
      metadata: { caseId: snap.id, uid, kind },
      client_reference_id: snap.id,
      // Prefills Checkout and lets Stripe send its payment receipt (enable
      // "Successful payments" emails in the Stripe dashboard for live mode).
      customer_email: email,
      success_url: `${base}${returnPath}`,
      cancel_url: `${base}/#/case/${snap.id}/${isInitialPurchase ? "preview" : "packet"}`,
    });

    await snap.ref.update({
      stripeSessionId: session.id,
      updatedAt: FieldValue.serverTimestamp(),
    });
    // Aggregate funnel counter only — no case or user data is logged.
    await bumpDaily({ "funnel.checkout_started": 1 });
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
      const kind = session.metadata?.kind ?? "packet";
      const buyerEmail =
        session.customer_details?.email ?? session.customer_email ?? null;
      if (caseId) {
        const db = getFirestore();
        const caseRef = db.collection("cases").doc(caseId);
        const purchaseRef = db.collection("purchases").doc(session.id);
        const mailRef = db.collection("mail").doc();
        const applied = await db.runTransaction(async (tx) => {
          const [caseSnap, purchaseSnap] = await Promise.all([
            tx.get(caseRef),
            tx.get(purchaseRef),
          ]);
          // Stripe retries webhooks — the purchase doc keyed by session id
          // makes each session apply exactly once.
          if (!caseSnap.exists || purchaseSnap.exists) return false;

          if (kind === "packet" || kind === "packet_plus") {
            if (caseSnap.get("paid") === true) return false;
            tx.update(caseRef, {
              paid: true,
              status: "paid",
              pricePaid: (session.amount_total ?? 0) / 100,
              stripeSessionId: session.id,
              followUpCredits:
                kind === "packet_plus"
                  ? config.fullCaseRoundsCap
                  : config.freeFollowUpRounds,
              ...(kind === "packet_plus" ? { fullCase: true } : {}),
              // Paid cases must survive the 24h cleanup even without an account.
              expiresAt: null,
              updatedAt: FieldValue.serverTimestamp(),
            });
          } else if (kind === "followup_round") {
            const current =
              (caseSnap.get("followUpCredits") as number | undefined) ??
              config.freeFollowUpRounds;
            tx.update(caseRef, {
              followUpCredits: current + 1,
              updatedAt: FieldValue.serverTimestamp(),
            });
          } else if (kind === "full_case") {
            tx.update(caseRef, {
              followUpCredits: config.fullCaseRoundsCap,
              fullCase: true,
              updatedAt: FieldValue.serverTimestamp(),
            });
          }

          tx.set(purchaseRef, {
            uid,
            caseId,
            kind,
            email: buyerEmail,
            amount: (session.amount_total ?? 0) / 100,
            currency: session.currency ?? "usd",
            status: "completed",
            stripeSessionId: session.id,
            createdAt: FieldValue.serverTimestamp(),
          });
          // Queue a purchase-confirmation email. Delivered by the Firebase
          // "Trigger Email" extension reading the `mail` collection; if the
          // extension isn't installed the doc is simply inert.
          if (buyerEmail) {
            const isPacket = kind === "packet" || kind === "packet_plus";
            const packetUrl = isPacket
              ? `${config.appBaseUrl}/#/case/${caseId}/purchase-success`
              : `${config.appBaseUrl}/#/case/${caseId}/packet`;
            const what =
              kind === "packet"
                ? "Full Appeal Packet"
                : kind === "packet_plus"
                  ? `Full Case (packet + up to ${config.fullCaseRoundsCap} follow-up rounds)`
                  : kind === "full_case"
                    ? `Full Case upgrade (up to ${config.fullCaseRoundsCap} follow-up rounds)`
                    : "additional follow-up round";
            tx.set(mailRef, {
              to: [buyerEmail],
              message: {
                subject: isPacket
                  ? "Your GetMyYes appeal packet is unlocked"
                  : "Your GetMyYes follow-up purchase is active",
                text:
                  `Thanks for your purchase! Your ${what} is active.\n\n` +
                  `Open your case any time: ${packetUrl}\n\n` +
                  "Sign in with the account you used at checkout to access it. " +
                  "Questions? Reply to this email.\n\n" +
                  "GetMyYes is a document drafting assistant — not medical, legal, " +
                  "or insurance advice. Review every document before sending.",
                html:
                  `<h2>You're all set 🎉</h2>` +
                  `<p>Thanks for your purchase! Your <strong>${what}</strong> is active.</p>` +
                  `<p><a href="${packetUrl}" style="background:#2563EB;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:700">Open my case</a></p>` +
                  `<p>Sign in with the account you used at checkout to access it any time.</p>` +
                  `<p style="color:#64748B;font-size:12px">GetMyYes is a document drafting assistant — not medical, legal, or insurance advice. Review every document before sending.</p>`,
              },
              createdAt: FieldValue.serverTimestamp(),
            });
          }
          return true;
        });
        if (applied) {
          // Aggregate revenue/funnel counters only — nothing user-identifying.
          await bumpDaily({
            "funnel.paid": 1,
            revenueCents: session.amount_total ?? 0,
          });
        }
      }
    }

    res.status(200).send({ received: true });
  },
);
