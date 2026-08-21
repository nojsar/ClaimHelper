/**
 * Read-only report over the production analytics aggregates.
 *
 * The /#/stats dashboard shows one window at a time; this prints the funnel
 * with stage-to-stage conversion, splits the window in half so every number
 * carries a direction, and ranks the acquisition segments — the things you
 * need side by side to decide what to fix next.
 *
 * Reads aggregate documents only. None of them contain a case id, user id,
 * prompt, or completion.
 *
 * Credentials, in order: functions/serviceAccountKey.json, then
 * GOOGLE_APPLICATION_CREDENTIALS / application default.
 *
 * Usage:
 *   node tool/analytics_report.mjs [--days 90] [--json]
 */
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
// firebase-admin lives in functions/, so resolve from that package.
const require = createRequire(path.join(projectRoot, "functions", "package.json"));
const { initializeApp, cert, applicationDefault } = require("firebase-admin/app");
const { getFirestore, FieldPath } = require("firebase-admin/firestore");

const PROJECT_ID = "claimhelper-38152";
const CUSTOMER_DAILY = "analytics_customer_daily";
const SEGMENT_DAILY = "analytics_customer_segment_daily";
const MODEL_DAILY = "analytics_model_daily";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const days = Number(args[args.indexOf("--days") + 1]) || 90;

const keyPath = path.join(projectRoot, "functions", "serviceAccountKey.json");
if (existsSync(keyPath)) {
  initializeApp({ credential: cert(require(keyPath)), projectId: PROJECT_ID });
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
} else {
  console.error(
    "[analytics] No credentials. Save a service account key to\n" +
      "  functions/serviceAccountKey.json  (Firebase Console -> Project Settings\n" +
      "  -> Service Accounts -> Generate new private key), or point\n" +
      "  GOOGLE_APPLICATION_CREDENTIALS at one.",
  );
  process.exit(1);
}
const db = getFirestore();

const dayKey = (offset) =>
  new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10);
const from = dayKey(days - 1);
const to = dayKey(0);

/** Daily documents nest their counters, so metrics are addressed by path. */
const pick = (doc, dotted) =>
  dotted.split(".").reduce((node, key) => (node == null ? undefined : node[key]), doc);

const sum = (docs, dotted) =>
  docs.reduce((acc, doc) => acc + (Number(pick(doc, dotted)) || 0), 0);

async function readRange(collection) {
  const snap = await db
    .collection(collection)
    .where(FieldPath.documentId(), ">=", from)
    .where(FieldPath.documentId(), "<=", to + "")
    .get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

const customer = await readRange(CUSTOMER_DAILY);
const model = await readRange(MODEL_DAILY);
const segments = await readRange(SEGMENT_DAILY);

if (!customer.length) {
  console.log(`[analytics] No documents in ${CUSTOMER_DAILY} between ${from} and ${to}.`);
  process.exit(0);
}

// Split the window so every headline number carries a direction.
const midpoint = dayKey(Math.floor(days / 2));
const older = customer.filter((doc) => doc.id < midpoint);
const newer = customer.filter((doc) => doc.id >= midpoint);

const FUNNEL = [
  ["Visits", "visits"],
  ["App opens", "boots"],
  ["Started appeal", "intent.start_appeal_clicked"],
  ["Started upload", "funnel.upload"],
  ["Added document", "intent.document_added"],
  ["Extraction started", "product.extraction.started"],
  ["Extraction done", "product.extraction.completed"],
  ["Preview completed", "product.preview.completed"],
  ["Saw preview", "funnel.preview"],
  ["Tier selected", "monetization.packet.tier_selected+monetization.full_case.tier_selected"],
  ["Started checkout", "funnel.checkout_started"],
  ["Paid", "funnel.paid"],
];

const TIERS = ["packet", "full_case", "followup_round", "full_case_upgrade"];

const total = (dotted, docs = customer) =>
  dotted.split("+").reduce((acc, part) => acc + sum(docs, part), 0);

const pct = (a, b) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "-");
const money = (cents) => `$${(cents / 100).toFixed(2)}`;

const report = {
  window: { from, to, days, daysWithData: customer.length },
  funnel: FUNNEL.map(([label, key]) => ({ label, count: total(key) })),
  revenue: {
    grossCents: total("revenueCents"),
    netCents: TIERS.reduce(
      (acc, tier) => acc + total(`monetization.${tier}.netRevenueCents`),
      0,
    ),
    modelCostCents: Math.round(sum(model, "model.estimatedCostMicros") / 10000),
  },
  tiers: TIERS.map((tier) => ({
    tier,
    paid: total(`monetization.${tier}.paid`),
    refunded: total(`monetization.${tier}.refunded`),
    expired: total(`monetization.${tier}.checkout_expired`),
    recovered: total(`monetization.${tier}.checkout_recovered`),
    netCents: total(`monetization.${tier}.netRevenueCents`),
  })),
  reliability: ["extraction", "preview", "packet"].map((op) => {
    const calls = sum(model, `model.operations.${op}.calls`);
    return {
      op,
      calls,
      errors: sum(model, `model.operations.${op}.errors`),
      avgMs: calls > 0
        ? Math.round(sum(model, `model.operations.${op}.totalDurationMs`) / calls)
        : 0,
    };
  }),
  outcomes: ["approved", "partially_approved", "denied", "withdrawn"].map((outcome) => ({
    outcome,
    count: total(`product.outcomes.${outcome}`),
  })),
  trend: FUNNEL.map(([label, key]) => ({
    label,
    older: total(key, older),
    newer: total(key, newer),
  })),
};

// Acquisition segments: doc ids are `${day}__${type}__${base64url(key)}`.
const bySegment = new Map();
for (const doc of segments) {
  const [, type, encoded] = doc.id.split("__");
  if (!type || !encoded) continue;
  const key = Buffer.from(encoded, "base64url").toString("utf8");
  const bucket = bySegment.get(type) ?? new Map();
  bucket.set(key, (bucket.get(key) ?? 0) + (Number(pick(doc, "visits")) || 0));
  bySegment.set(type, bucket);
}
report.segments = Object.fromEntries(
  [...bySegment].map(([type, bucket]) => [
    type,
    [...bucket]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([key, visits]) => ({ key, visits })),
  ]),
);

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const row = (label, value, note = "") =>
  console.log(`  ${label.padEnd(24)}${String(value).padStart(10)}  ${note}`);

console.log(`\nGetMyYes analytics - ${from} to ${to} (${customer.length} days with data)`);

console.log("\nFUNNEL                        count  of visits    step");
let previous = null;
for (const stage of report.funnel) {
  const ofVisits = pct(stage.count, report.funnel[0].count);
  const step = previous === null ? "" : pct(stage.count, previous);
  console.log(
    `  ${stage.label.padEnd(24)}${String(stage.count).padStart(9)}` +
      `${ofVisits.padStart(11)}${step.padStart(8)}`,
  );
  previous = stage.count;
}

console.log("\nREVENUE");
row("Gross", money(report.revenue.grossCents));
row("Net (after refunds)", money(report.revenue.netCents));
row(
  "Model cost",
  money(report.revenue.modelCostCents),
  report.revenue.netCents > 0
    ? `${pct(report.revenue.modelCostCents, report.revenue.netCents)} of net`
    : "",
);

console.log("\nTIERS                          paid  refund  expired  recovered      net");
for (const tier of report.tiers) {
  console.log(
    `  ${tier.tier.padEnd(22)}${String(tier.paid).padStart(6)}` +
      `${String(tier.refunded).padStart(8)}${String(tier.expired).padStart(9)}` +
      `${String(tier.recovered).padStart(11)}${money(tier.netCents).padStart(9)}`,
  );
}

console.log("\nRELIABILITY                   calls  errors    rate   avg ms");
for (const item of report.reliability) {
  console.log(
    `  ${item.op.padEnd(22)}${String(item.calls).padStart(7)}` +
      `${String(item.errors).padStart(8)}${pct(item.errors, item.calls).padStart(8)}` +
      `${String(item.avgMs).padStart(9)}`,
  );
}

console.log("\nOUTCOMES");
for (const outcome of report.outcomes) row(outcome.outcome, outcome.count);

console.log(`\nTREND (first half -> second half of the ${days}-day window)`);
for (const item of report.trend) {
  const direction = item.newer > item.older ? "up" : item.newer < item.older ? "down" : "flat";
  console.log(
    `  ${item.label.padEnd(24)}${String(item.older).padStart(8)} -> ` +
      `${String(item.newer).padEnd(8)} ${direction}`,
  );
}

for (const [type, rows] of Object.entries(report.segments)) {
  console.log(`\nTOP ${type.toUpperCase()}`);
  for (const entry of rows) row(entry.key.slice(0, 24) || "(none)", entry.visits);
}
console.log();
