import fs from "node:fs";
import path from "node:path";

import OpenAI from "openai";

import { evaluatePacket, ModelEvalFixture } from "../model_eval";
import { packetSchema, previewSchema } from "../openai/schemas";
import {
  PACKET_SYSTEM_PROMPT,
  PREVIEW_SYSTEM_PROMPT,
  buildPacketUserPrompt,
  buildPreviewUserPrompt,
} from "../openai/prompts";

/**
 * Is what customers get worth paying for? Runs the production prompts and
 * schemas (free summary + paid packet) on realistic fictional denials, for one
 * or more models, then has a separate judge model grade each result against a
 * fixed rubric. Reports quality, latency and the model cost of each packet.
 *
 *   OPENAI_API_KEY=... npm run eval:value -- --models gpt-5.6-terra,gpt-6.1-sol
 *
 * Opt-in and paid (a few dollars a run); never part of the test suite. Writes
 * eval-output/value-eval-<time>.{md,json} with every generated document so a
 * person can read them, not just the scores.
 */

type Fixture = ModelEvalFixture & { about: string };

// Production settings come from functions/.env, as in Cloud Functions.
for (const line of fs.readFileSync(path.resolve(process.cwd(), ".env"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].trim();
}

const argValue = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const models = (argValue("--models") || process.env.OPENAI_MODEL || "gpt-5.6-terra").split(",").map((m) => m.trim());
const judgeModel = argValue("--judge") || "gpt-6-sol";
const effort = process.env.OPENAI_REASONING_EFFORT || "high";
const only = argValue("--only");

// USD per million tokens: input, cached input, output. The OpenAI price list
// on the day this was written; update with the price list.
const PRICES: Record<string, [number, number, number]> = {
  "gpt-5.6-terra": [2.5, 0.25, 15],
  "gpt-6.1-sol": [5, 0.5, 25],
  "gpt-6-sol": [5, 0.5, 25],
};

type Usage = { input: number; cached: number; output: number; seconds: number };

async function structured(
  client: OpenAI,
  model: string,
  systemPrompt: string,
  userText: string,
  schemaName: string,
  schema: Record<string, unknown>,
  maxOutputTokens: number,
): Promise<{ value: Record<string, unknown>; usage: Usage }> {
  const started = Date.now();
  // The same request runStructured() sends in production.
  const response = await client.responses.create({
    model,
    store: false,
    max_output_tokens: maxOutputTokens,
    input: [
      { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
      { role: "user", content: [{ type: "input_text", text: userText }] },
    ],
    text: { format: { type: "json_schema", name: schemaName, schema, strict: true } },
    ...({
      reasoning: { effort },
      service_tier: process.env.OPENAI_SERVICE_TIER || "default",
    } as Record<string, unknown>),
  });
  const usage = response.usage as unknown as {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
  };
  if (!response.output_text) throw new Error(`${model}: empty ${schemaName} response`);
  return {
    value: JSON.parse(response.output_text) as Record<string, unknown>,
    usage: {
      input: usage?.input_tokens ?? 0,
      cached: usage?.input_tokens_details?.cached_tokens ?? 0,
      output: usage?.output_tokens ?? 0,
      seconds: (Date.now() - started) / 1000,
    },
  };
}

function cost(model: string, usage: Usage): number | null {
  const price = PRICES[model];
  if (!price) return null;
  return ((usage.input - usage.cached) * price[0] + usage.cached * price[1] + usage.output * price[2]) / 1_000_000;
}

const CRITERIA = [
  "factual_fidelity",
  "denial_understanding",
  "procedural_accuracy",
  "evidence_specificity",
  "letter_quality",
  "call_script_usefulness",
  "safety_compliance",
  "value_for_price",
] as const;

const judgeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["scores", "worthPaying", "strengths", "problems", "missing", "comparedToFreeAlternatives"],
  properties: {
    scores: {
      type: "object",
      additionalProperties: false,
      required: [...CRITERIA],
      properties: Object.fromEntries(CRITERIA.map((c) => [c, { type: "integer" }])),
    },
    worthPaying: { type: "string", enum: ["yes", "borderline", "no"] },
    strengths: { type: "array", items: { type: "string" } },
    problems: { type: "array", items: { type: "string" } },
    missing: { type: "array", items: { type: "string" } },
    comparedToFreeAlternatives: { type: "string" },
  },
};

const JUDGE_PROMPT = `You are a strict reviewer of consumer health-insurance appeal documents, with the knowledge of an experienced US patient advocate. You grade a free summary and a paid ($5) appeal packet that software drafted for a consumer from their denial and their answers.

Score each criterion 1-5 (5 = an experienced patient advocate would be satisfied; 3 = usable with fixes; 1 = wrong or harmful):
- factual_fidelity: uses only the facts given; invents nothing (no made-up dates, numbers, diagnoses, policy names, laws or clinical claims). Unknowns are marked as placeholders.
- denial_understanding: explains correctly and plainly why the plan denied it, in terms the consumer can act on.
- procedural_accuracy: the appeal route, deadlines and escalation are right for this plan type and state (employer/ERISA vs fully insured vs Marketplace, internal appeal, peer-to-peer, expedited review, external review, state regulator), and it says to confirm where unsure. Penalise confident errors heavily.
- evidence_specificity: the evidence checklist is tailored to THIS denial reason and criteria, not generic.
- letter_quality: the appeal letter answers the plan's stated reason point by point, requests the criteria and claim file where relevant, is professional, and is ready to send once placeholders are filled.
- call_script_usefulness: the call script would genuinely help on the phone (what to ask, what to note down).
- safety_compliance: no promised outcome, no medical or legal advice presented as such, careful attribution of clinical statements, appropriate disclaimer.
- value_for_price: would a reasonable person who received this denial feel $5 was well spent, compared with free options (a generic template, a free guide, or asking a general chatbot)?

Then: worthPaying (yes / borderline / no), concrete strengths, concrete problems (quote the text), anything important that is missing, and one or two sentences comparing it with what the free alternatives would give. Be specific and critical; do not inflate scores.`;

async function main(): Promise<void> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Set OPENAI_API_KEY to run the opt-in value evaluation.");
  const client = new OpenAI({ apiKey: key });
  const fixtures = (JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), "src/test/fixtures/value_eval_cases.json"), "utf8"),
  ) as Fixture[]).filter((f) => !only || f.id === only);

  const results: Record<string, unknown>[] = [];
  for (const model of models) {
    for (const fixture of fixtures) {
      const extraction = JSON.stringify(fixture.extraction);
      const answers = JSON.stringify(fixture.guidedAnswers);
      console.log(`[value-eval] ${model} / ${fixture.id}: summary...`);
      const preview = await structured(client, model, PREVIEW_SYSTEM_PROMPT,
        buildPreviewUserPrompt(extraction, answers, fixture.userAdditions), "denial_preview", previewSchema, 8000);
      console.log(`[value-eval] ${model} / ${fixture.id}: packet...`);
      const packet = await structured(client, model, PACKET_SYSTEM_PROMPT,
        buildPacketUserPrompt(extraction, answers, fixture.userAdditions), "appeal_packet", packetSchema, 30000);
      const checks = evaluatePacket(fixture, packet.value);
      console.log(`[value-eval] ${model} / ${fixture.id}: grading...`);
      const judged = await structured(client, judgeModel, JUDGE_PROMPT,
        `CASE: ${fixture.about}\n\nDENIAL FACTS:\n${extraction}\n\nCONSUMER'S ANSWERS:\n${answers}\n\nCONSUMER'S OWN WORDS:\n${fixture.userAdditions ?? "(none)"}\n\nFREE SUMMARY:\n${JSON.stringify(preview.value, null, 1)}\n\nPAID PACKET:\n${JSON.stringify(packet.value, null, 1)}`,
        "appeal_review", judgeSchema, 16000);
      const scores = judged.value.scores as Record<string, number>;
      const average = CRITERIA.reduce((sum, c) => sum + scores[c], 0) / CRITERIA.length;
      results.push({
        model,
        fixture: fixture.id,
        about: fixture.about,
        average: Number(average.toFixed(2)),
        judge: judged.value,
        deterministicChecks: checks,
        summarySeconds: preview.usage.seconds,
        packetSeconds: packet.usage.seconds,
        packetCostUsd: cost(model, packet.usage),
        summaryCostUsd: cost(model, preview.usage),
        preview: preview.value,
        packet: packet.value,
      });
      console.log(`[value-eval] ${model} / ${fixture.id}: average ${average.toFixed(2)}, worth paying: ${judged.value.worthPaying}, packet ${packet.usage.seconds.toFixed(0)} s`);
    }
  }

  const outDir = path.resolve(process.cwd(), "eval-output");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  fs.writeFileSync(path.join(outDir, `value-eval-${stamp}.json`), JSON.stringify(results, null, 2));

  const lines: string[] = [`# Value evaluation ${stamp}`, "", `Judge: ${judgeModel}. Reasoning effort: ${effort}.`, ""];
  for (const model of models) {
    const rows = results.filter((r) => r.model === model);
    const mean = (pick: (r: Record<string, unknown>) => number) => rows.reduce((s, r) => s + pick(r), 0) / Math.max(1, rows.length);
    lines.push(`## ${model}`, "",
      `Average score ${mean((r) => r.average as number).toFixed(2)} / 5 · summary ${mean((r) => r.summarySeconds as number).toFixed(0)} s · packet ${mean((r) => r.packetSeconds as number).toFixed(0)} s · model cost per case $${mean((r) => ((r.packetCostUsd as number) ?? 0) + ((r.summaryCostUsd as number) ?? 0)).toFixed(3)}`, "",
      `| Case | ${CRITERIA.join(" | ")} | Avg | Worth $5 |`,
      `|---|${CRITERIA.map(() => "---").join("|")}|---|---|`);
    for (const r of rows) {
      const j = r.judge as { scores: Record<string, number>; worthPaying: string };
      lines.push(`| ${r.fixture} | ${CRITERIA.map((c) => j.scores[c]).join(" | ")} | ${r.average} | ${j.worthPaying} |`);
    }
    lines.push("");
    for (const r of rows) {
      const j = r.judge as { strengths: string[]; problems: string[]; missing: string[]; comparedToFreeAlternatives: string };
      lines.push(`### ${model} · ${r.fixture}`, "", `*${r.about}*`, "",
        `**Compared with free options:** ${j.comparedToFreeAlternatives}`, "",
        "**Strengths**", ...j.strengths.map((s) => `- ${s}`), "",
        "**Problems**", ...j.problems.map((s) => `- ${s}`), "",
        "**Missing**", ...j.missing.map((s) => `- ${s}`), "",
        `**Automatic checks:** ${(r.deterministicChecks as string[]).length ? (r.deterministicChecks as string[]).join("; ") : "passed"}`, "");
    }
  }
  fs.writeFileSync(path.join(outDir, `value-eval-${stamp}.md`), lines.join("\n"));
  console.log(`[value-eval] report: eval-output/value-eval-${stamp}.md`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
