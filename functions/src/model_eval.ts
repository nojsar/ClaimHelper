import { extractionSchema, packetSchema } from "./openai/schemas";

export type ModelEvalFixture = {
  id: string;
  extraction: Record<string, unknown>;
  guidedAnswers: Record<string, unknown>;
  userAdditions: string | null;
  fieldsThatMustStayUnknown: string[];
  requiredPlaceholderTerms: string[];
  unsupportedCertaintyPhrases: string[];
};

function textContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textContent).join("\n");
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .map(textContent)
      .join("\n");
  }
  return "";
}

function exactTopLevelKeys(
  value: Record<string, unknown>,
  schema: { required: readonly string[]; properties: Record<string, unknown> },
): string[] {
  const errors: string[] = [];
  const required = new Set(schema.required);
  const allowed = new Set(Object.keys(schema.properties));
  for (const key of required) {
    if (!(key in value)) errors.push(`missing required field: ${key}`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`unexpected field: ${key}`);
  }
  return errors;
}

export function evaluateExtraction(
  fixture: ModelEvalFixture,
  actual: Record<string, unknown>,
): string[] {
  const errors = exactTopLevelKeys(
    actual,
    extractionSchema as unknown as {
      required: readonly string[];
      properties: Record<string, unknown>;
    },
  );
  for (const field of fixture.fieldsThatMustStayUnknown) {
    if (actual[field] !== null) {
      errors.push(`${field} must remain null when the fixture does not supply it`);
    }
  }
  if (textContent(actual).length > 40_000) {
    errors.push("extraction exceeds deterministic size budget");
  }
  return errors;
}

export function evaluatePacket(
  fixture: ModelEvalFixture,
  actual: Record<string, unknown>,
): string[] {
  const errors = exactTopLevelKeys(
    actual,
    packetSchema as unknown as {
      required: readonly string[];
      properties: Record<string, unknown>;
    },
  );
  const text = textContent(actual);
  const normalized = text.toLowerCase();
  for (const phrase of fixture.unsupportedCertaintyPhrases) {
    if (normalized.includes(phrase.toLowerCase())) {
      errors.push(`unsupported certainty phrase: ${phrase}`);
    }
  }
  for (const term of fixture.requiredPlaceholderTerms) {
    const normalizedTerm = term.toLowerCase();
    if (
      !normalized.includes(`[${normalizedTerm}]`) &&
      !normalized.includes(`{${normalizedTerm}}`) &&
      !normalized.includes(normalizedTerm)
    ) {
      errors.push(`missing safe placeholder or instruction for: ${term}`);
    }
  }
  if (text.length > 120_000) {
    errors.push("packet exceeds deterministic size budget");
  }
  return errors;
}

