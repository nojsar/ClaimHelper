import fs from "node:fs";
import path from "node:path";

import OpenAI from "openai";

import { evaluatePacket, ModelEvalFixture } from "../model_eval";
import { packetSchema } from "../openai/schemas";
import {
  PACKET_SYSTEM_PROMPT,
  buildPacketUserPrompt,
} from "../openai/prompts";

async function main(): Promise<void> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "Set OPENAI_API_KEY explicitly to run the opt-in live model evaluation.",
    );
  }
  const fixtures = JSON.parse(
    fs.readFileSync(
      path.resolve(process.cwd(), "src/test/fixtures/model_eval_cases.json"),
      "utf8",
    ),
  ) as ModelEvalFixture[];
  const client = new OpenAI({ apiKey: key });
  let failures = 0;

  for (const fixture of fixtures) {
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.6-terra",
      store: false,
      max_output_tokens: 30_000,
      reasoning: {
        effort: (process.env.OPENAI_REASONING_EFFORT || "high") as "high",
      },
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: PACKET_SYSTEM_PROMPT }],
        },
        {
          role: "user",
          content: [{
            type: "input_text",
            text: buildPacketUserPrompt(
              JSON.stringify(fixture.extraction),
              JSON.stringify(fixture.guidedAnswers),
              fixture.userAdditions,
            ),
          }],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "appeal_packet_eval",
          schema: packetSchema,
          strict: true,
        },
      },
    });
    const output = JSON.parse(response.output_text) as Record<string, unknown>;
    const errors = evaluatePacket(fixture, output);
    if (errors.length > 0) {
      failures += 1;
      console.error(`${fixture.id}: ${errors.join("; ")}`);
    } else {
      console.log(`${fixture.id}: passed`);
    }
  }
  if (failures > 0) process.exitCode = 1;
}

void main();
