import { HttpsError } from "firebase-functions/v2/https";

const DOCUMENT_TYPES = new Set([
  "denial_letter",
  "eob",
  "prior_authorization",
  "bill",
  "unknown",
]);
const DENIAL_CATEGORIES = new Set([
  "medication",
  "prior_authorization",
  "not_medically_necessary",
  "step_therapy",
  "formulary_exclusion",
  "out_of_network",
  "excluded_benefit",
  "duplicate_claim",
  "missing_information",
  "experimental",
  "partial_payment",
  "unknown",
]);
const RELATIONS = new Set(["self", "child", "cared_person"]);
const INSURANCE_TYPES = new Set([
  "employer",
  "marketplace",
  "medicare",
  "medicaid",
  "student",
  "unknown",
]);
const DESIRED_OUTCOMES = new Set([
  "approve_treatment",
  "pay_bill",
  "reimburse",
  "formulary_exception",
  "network_exception",
  "external_review",
]);
const SUPPORTING_DOCUMENTS = new Set([
  "denial_letter",
  "eob",
  "bill",
  "prescription",
  "doctor_letter",
  "chart_notes",
  "lab_results",
  "medical_policy",
  "call_notes",
]);
const ALTERNATIVE_OUTCOMES = new Set([
  "failed",
  "not_tolerated",
  "contraindicated",
  "other",
]);
const EXTRACTION_KEYS = new Set([
  "documentType",
  "denialCategory",
  "insurerName",
  "planName",
  "patientName",
  "memberIdLast4",
  "claimNumber",
  "priorAuthNumber",
  "dateOfService",
  "denialDate",
  "appealDeadline",
  "deniedItem",
  "providerName",
  "prescriberName",
  "denialReasonText",
  "amountBilled",
  "patientResponsibility",
  "appealInstructions",
  "phoneNumbers",
  "mailingAddresses",
  "missingFields",
  "sourceSnippets",
]);
const GUIDED_KEYS = new Set([
  "relation",
  "usState",
  "insuranceType",
  "desiredOutcome",
  "isUrgent",
  "urgencyNote",
  "triedAlternatives",
  "documentsOnHand",
  "contactedInsurer",
  "contactNotes",
]);

function invalid(message: string): never {
  throw new HttpsError("invalid-argument", message);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return invalid(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: Set<string>,
  label: string,
): void {
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    invalid(`${label} contains an unsupported field.`);
  }
}

function nullableString(
  value: unknown,
  label: string,
  maxLength: number,
): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") invalid(`${label} must be text or empty.`);
  const text = value.trim();
  if (text.length > maxLength) invalid(`${label} is too long.`);
  return text || null;
}

function enumOrNull(
  value: unknown,
  allowed: Set<string>,
  label: string,
): string | null {
  const text = nullableString(value, label, 80);
  if (text !== null && !allowed.has(text)) invalid(`${label} is invalid.`);
  return text;
}

function nullableBoolean(value: unknown, label: string): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "boolean") invalid(`${label} must be true, false, or empty.`);
  return value;
}

function finiteAmount(value: unknown, label: string): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    invalid(`${label} must be a valid amount or empty.`);
  }
  if (value < 0 || value > 100_000_000) invalid(`${label} is outside the allowed range.`);
  return Math.round(value * 100) / 100;
}

function stringList(
  value: unknown,
  label: string,
  maxItems: number,
  maxItemLength: number,
): string[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    invalid(`${label} must contain at most ${maxItems} items.`);
  }
  return value.map((item, index) => {
    const text = nullableString(item, `${label} item ${index + 1}`, maxItemLength);
    if (text === null) invalid(`${label} cannot contain empty items.`);
    return text;
  });
}

/**
 * Validate the complete user-editable extraction before it reaches a prompt.
 * The returned object is rebuilt from an allowlist so prototype/extra fields
 * cannot pass through JSON serialization.
 */
export function parseEditableExtraction(value: unknown): Record<string, unknown> {
  const source = record(value, "extraction");
  rejectUnknownKeys(source, EXTRACTION_KEYS, "extraction");
  const documentType = enumOrNull(
    source.documentType,
    DOCUMENT_TYPES,
    "documentType",
  );
  const denialCategory = enumOrNull(
    source.denialCategory,
    DENIAL_CATEGORIES,
    "denialCategory",
  );
  if (!documentType || !denialCategory) {
    invalid("documentType and denialCategory are required.");
  }
  const snippets = source.sourceSnippets;
  if (!Array.isArray(snippets) || snippets.length > 40) {
    invalid("sourceSnippets must contain at most 40 items.");
  }

  return {
    documentType,
    denialCategory,
    insurerName: nullableString(source.insurerName, "insurerName", 300),
    planName: nullableString(source.planName, "planName", 300),
    patientName: nullableString(source.patientName, "patientName", 300),
    memberIdLast4: nullableString(source.memberIdLast4, "memberIdLast4", 20),
    claimNumber: nullableString(source.claimNumber, "claimNumber", 120),
    priorAuthNumber: nullableString(source.priorAuthNumber, "priorAuthNumber", 120),
    dateOfService: nullableString(source.dateOfService, "dateOfService", 80),
    denialDate: nullableString(source.denialDate, "denialDate", 80),
    appealDeadline: nullableString(source.appealDeadline, "appealDeadline", 160),
    deniedItem: nullableString(source.deniedItem, "deniedItem", 1_000),
    providerName: nullableString(source.providerName, "providerName", 300),
    prescriberName: nullableString(source.prescriberName, "prescriberName", 300),
    denialReasonText: nullableString(
      source.denialReasonText,
      "denialReasonText",
      8_000,
    ),
    amountBilled: finiteAmount(source.amountBilled, "amountBilled"),
    patientResponsibility: finiteAmount(
      source.patientResponsibility,
      "patientResponsibility",
    ),
    appealInstructions: nullableString(
      source.appealInstructions,
      "appealInstructions",
      8_000,
    ),
    phoneNumbers: stringList(source.phoneNumbers, "phoneNumbers", 20, 100),
    mailingAddresses: stringList(
      source.mailingAddresses,
      "mailingAddresses",
      20,
      500,
    ),
    missingFields: stringList(source.missingFields, "missingFields", 50, 100),
    sourceSnippets: snippets.map((item, index) => {
      const snippet = record(item, `sourceSnippet ${index + 1}`);
      rejectUnknownKeys(snippet, new Set(["field", "snippet"]), "sourceSnippet");
      const field = nullableString(snippet.field, "sourceSnippet field", 100);
      const text = nullableString(snippet.snippet, "sourceSnippet text", 2_000);
      if (!field || !text) invalid("sourceSnippets require field and snippet.");
      return { field, snippet: text };
    }),
  };
}

/** Validate and rebuild guided answers from fixed, bounded fields. */
export function parseGuidedAnswers(value: unknown): Record<string, unknown> {
  const source = record(value, "guidedAnswers");
  rejectUnknownKeys(source, GUIDED_KEYS, "guidedAnswers");
  const alternatives = source.triedAlternatives ?? [];
  if (!Array.isArray(alternatives) || alternatives.length > 20) {
    invalid("triedAlternatives must contain at most 20 items.");
  }
  const documents = stringList(
    source.documentsOnHand ?? [],
    "documentsOnHand",
    20,
    80,
  );
  if (documents.some((item) => !SUPPORTING_DOCUMENTS.has(item))) {
    invalid("documentsOnHand contains an unsupported value.");
  }
  const state = nullableString(source.usState, "usState", 2);
  if (state && !/^[A-Za-z]{2}$/.test(state)) invalid("usState must be a two-letter code.");

  return {
    relation: enumOrNull(source.relation, RELATIONS, "relation"),
    usState: state?.toUpperCase() ?? null,
    insuranceType: enumOrNull(
      source.insuranceType,
      INSURANCE_TYPES,
      "insuranceType",
    ),
    desiredOutcome: enumOrNull(
      source.desiredOutcome,
      DESIRED_OUTCOMES,
      "desiredOutcome",
    ),
    isUrgent: nullableBoolean(source.isUrgent, "isUrgent"),
    urgencyNote: nullableString(source.urgencyNote, "urgencyNote", 2_000),
    triedAlternatives: alternatives.map((item, index) => {
      const alternative = record(item, `triedAlternative ${index + 1}`);
      rejectUnknownKeys(
        alternative,
        new Set(["name", "outcome"]),
        "triedAlternative",
      );
      const name = nullableString(alternative.name, "alternative name", 300);
      const outcome = enumOrNull(
        alternative.outcome,
        ALTERNATIVE_OUTCOMES,
        "alternative outcome",
      );
      if (!name || !outcome) invalid("Each tried alternative needs a name and outcome.");
      return { name, outcome };
    }),
    documentsOnHand: documents,
    contactedInsurer: nullableBoolean(
      source.contactedInsurer,
      "contactedInsurer",
    ),
    contactNotes: nullableString(source.contactNotes, "contactNotes", 4_000),
  };
}

/** Bound legacy/stored additions before prompt construction. */
export function boundedUserAdditions(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, 8_000) : null;
}

