/**
 * The release's payment check, against production, without charging anyone.
 *
 *   node tool/payment_smoke.mjs
 *
 * 1. Checkout: a throwaway signed-in test user opens a case and asks for the
 *    $5 packet checkout. The callable must reach Stripe with the live key and
 *    return a hosted Checkout page that loads. Nobody pays it; the session
 *    expires on its own within 24 hours, and the case and user are deleted
 *    here, so its expiry finds nothing to touch. Flagged releaseCheck, so it
 *    never enters the funnel.
 * 2. Fulfilment: read-only, counts paid cases whose packet has been stuck for
 *    more than two hours (pending, fulfilling, retry_wait, needs_attention).
 *    Prints counts only, never case contents or customer details.
 *
 * Needs functions/serviceAccountKey.json (admin, local only) to mint the test
 * user's token and read the counts. Exits 1 if checkout fails or a paid
 * packet is stuck.
 */
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "functions", "package.json"));
const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");

const options = await readFile(path.join(root, "lib", "firebase_options.dart"), "utf8");
const web = options.slice(options.indexOf("static const FirebaseOptions web"));
const field = (name) => web.match(new RegExp(`${name}: '([^']+)'`))?.[1];
const apiKey = field("apiKey");
const projectId = field("projectId");
if (!apiKey || !projectId) throw new Error("payment check: web Firebase options not found.");
const functionsBase = `https://us-central1-${projectId}.cloudfunctions.net`;

const serviceAccount = JSON.parse(await readFile(path.join(root, "functions", "serviceAccountKey.json"), "utf8"));
initializeApp({ credential: cert(serviceAccount), projectId });

async function json(response, step) {
  const text = await response.text();
  if (!response.ok) throw new Error(`payment check: ${step} failed with HTTP ${response.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

async function callable(name, idToken, data) {
  const response = await fetch(`${functionsBase}/${name}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
  });
  return (await json(response, name)).result;
}

const failures = [];

// 1. Checkout ---------------------------------------------------------------
// A custom-token user is a signed-in (non-anonymous) account, which checkout
// requires, with no email, so Stripe sends it nothing.
const uid = `release-check-${Date.now()}`;
let caseId = null;
let idToken = null;
try {
  const customToken = await getAuth().createCustomToken(uid, { releaseCheck: true });
  const signIn = await json(
    await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }),
    "test sign-in",
  );
  idToken = signIn.idToken;
  const session = await callable("createCaseUploadSession", idToken, { consentConfirmed: true, releaseCheck: true });
  caseId = session.caseId;
  const checkout = await callable("createCheckoutSession", idToken, { caseId, kind: "packet", releaseCheck: true });
  if (!checkout?.checkoutUrl?.startsWith("https://checkout.stripe.com/")) {
    throw new Error(`payment check: no Stripe Checkout URL came back (${JSON.stringify(checkout).slice(0, 200)}).`);
  }
  const page = await fetch(checkout.checkoutUrl, { redirect: "follow" });
  if (!page.ok) throw new Error(`payment check: the Stripe Checkout page answered HTTP ${page.status}.`);
  console.log("[payment-check] Checkout: the live Stripe key works and the $5 packet checkout page loads.");
} catch (error) {
  failures.push(error.message);
} finally {
  if (caseId && idToken) {
    await callable("deleteCaseAndFiles", idToken, { caseId }).catch((e) => console.warn(`[payment-check] cleanup: ${e.message}`));
  }
  await getAuth().deleteUser(uid).catch(() => {});
}

// 2. Fulfilment -------------------------------------------------------------
try {
  const stuckBefore = Timestamp.fromMillis(Date.now() - 2 * 3600 * 1000);
  const open = await getFirestore()
    .collection("cases")
    .where("paid", "==", true)
    .where("packetFulfillmentStatus", "in", ["pending", "fulfilling", "retry_wait", "needs_attention"])
    .get();
  const stuck = open.docs.filter((doc) => {
    const updated = doc.get("updatedAt");
    return !updated || updated.toMillis() < stuckBefore.toMillis();
  });
  const paid30 = await getFirestore()
    .collection("cases")
    .where("paid", "==", true)
    .where("updatedAt", ">=", Timestamp.fromMillis(Date.now() - 30 * 86400 * 1000))
    .count()
    .get()
    .then((snap) => snap.data().count)
    .catch(() => null);
  console.log(
    `[payment-check] Fulfilment: ${open.size} paid packet(s) in progress, ${stuck.length} stuck for over 2 hours` +
      (paid30 === null ? "." : `; ${paid30} paid case(s) active in the last 30 days.`),
  );
  if (stuck.length) failures.push(`payment check: ${stuck.length} paid packet(s) stuck for over 2 hours; see /#/stats or the case tracker.`);
} catch (error) {
  failures.push(`payment check: could not read fulfilment status (${error.message.slice(0, 200)}).`);
}

if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
