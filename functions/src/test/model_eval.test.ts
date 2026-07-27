import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  evaluateExtraction,
  evaluatePacket,
  ModelEvalFixture,
} from "../model_eval";

const fixtures = JSON.parse(
  fs.readFileSync(
    path.resolve(process.cwd(), "src/test/fixtures/model_eval_cases.json"),
    "utf8",
  ),
) as ModelEvalFixture[];

test("anonymized model eval fixture set remains available", () => {
  assert.ok(fixtures.length >= 3);
  assert.ok(fixtures.every((fixture) => !JSON.stringify(fixture).includes("@")));
});

test("extraction eval catches invented unknown fields", () => {
  const fixture = fixtures[0];
  const invented = {
    ...fixture.extraction,
    appealDeadline: "2026-03-01",
  };
  assert.deepEqual(evaluateExtraction(fixture, fixture.extraction), []);
  assert.ok(
    evaluateExtraction(fixture, invented).some((error) =>
      error.includes("appealDeadline must remain null"),
    ),
  );
});

test("packet eval catches unsupported guarantees and missing placeholders", () => {
  const fixture = fixtures[0];
  const packet = {
    plainEnglishSummary: "Summary",
    appealStrategy: "Strategy",
    appealLetter: "This will be approved.",
    doctorLetterRequest: "Request",
    evidenceChecklist: [],
    insurerCallScript: "Call",
    deadlineChecklist: [],
    warnings: [],
    disclaimer: "Not advice.",
  };
  const errors = evaluatePacket(fixture, packet);
  assert.ok(errors.some((error) => error.includes("will be approved")));
  assert.ok(errors.some((error) => error.includes("claim number")));
});

