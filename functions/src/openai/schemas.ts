/**
 * JSON Schemas for OpenAI Structured Outputs (strict mode).
 *
 * Strict-mode rules honored here:
 *  - every property is listed in `required`
 *  - `additionalProperties: false` on every object
 *  - nullable fields use `"type": ["string", "null"]` style unions
 */

export const extractionSchema = {
  type: "object",
  additionalProperties: false,
  required: [
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
  ],
  properties: {
    documentType: {
      type: "string",
      enum: ["denial_letter", "eob", "prior_authorization", "bill", "unknown"],
    },
    denialCategory: {
      type: "string",
      enum: [
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
      ],
    },
    insurerName: { type: ["string", "null"] },
    planName: { type: ["string", "null"] },
    patientName: { type: ["string", "null"] },
    memberIdLast4: { type: ["string", "null"] },
    claimNumber: { type: ["string", "null"] },
    priorAuthNumber: { type: ["string", "null"] },
    dateOfService: { type: ["string", "null"] },
    denialDate: { type: ["string", "null"] },
    appealDeadline: {
      type: ["string", "null"],
      description:
        "Appeal filing deadline. Prefer an absolute ISO date (YYYY-MM-DD); if the document gives a relative period (e.g. 180 days), compute it from the denial/notice date. Null if unknown.",
    },
    deniedItem: { type: ["string", "null"] },
    providerName: { type: ["string", "null"] },
    prescriberName: { type: ["string", "null"] },
    denialReasonText: { type: ["string", "null"] },
    amountBilled: { type: ["number", "null"] },
    patientResponsibility: { type: ["number", "null"] },
    appealInstructions: { type: ["string", "null"] },
    phoneNumbers: {
      type: "array",
      items: { type: "string" },
      description:
        "Dialable member-services or appeals phone numbers. Exclude TTY/relay codes like 'TTY 711' and standalone fax numbers.",
    },
    mailingAddresses: { type: "array", items: { type: "string" } },
    missingFields: { type: "array", items: { type: "string" } },
    sourceSnippets: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field", "snippet"],
        properties: {
          field: { type: "string" },
          snippet: { type: "string" },
        },
      },
    },
  },
} as const;

export const previewSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "denialSummary",
    "amountAtStake",
    "likelyAppealPath",
    "missingInfo",
    "recommendedPacketType",
  ],
  properties: {
    denialSummary: {
      type: "string",
      description: "2-4 sentence plain-English summary of what was denied and why.",
    },
    amountAtStake: {
      type: ["string", "null"],
      description: "Human-readable amount at stake, e.g. '$1,240 billed to you', or null if unknown.",
    },
    likelyAppealPath: {
      type: "string",
      description: "One sentence naming the likely appeal path (internal appeal, formulary exception, etc.).",
    },
    missingInfo: {
      type: "array",
      items: { type: "string" },
      description: "Facts or documents the user still needs to supply.",
    },
    recommendedPacketType: {
      type: "string",
      description: "Short label for the packet that fits this denial, e.g. 'Prior authorization appeal packet'.",
    },
  },
} as const;

export const followUpSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "situationSummary",
    "recommendedNextSteps",
    "responseLetter",
    "callScript",
    "deadlineNotes",
    "warnings",
    "disclaimer",
  ],
  properties: {
    situationSummary: {
      type: "string",
      description:
        "Plain-English reading of where the case stands after the insurer's response.",
    },
    recommendedNextSteps: {
      type: "string",
      description:
        "Concrete ordered next moves (second-level appeal, external review, regulator complaint, provide documents, etc.).",
    },
    responseLetter: {
      type: "string",
      description:
        "Ready-to-review draft of the next written response (follow-up letter, second-level appeal, or external-review request), matching the situation.",
    },
    callScript: {
      type: "string",
      description: "Updated word-for-word insurer call script for this stage.",
    },
    deadlineNotes: {
      type: ["string", "null"],
      description: "Any deadlines now in play, or null if none are known.",
    },
    warnings: { type: "array", items: { type: "string" } },
    disclaimer: { type: "string" },
  },
} as const;

export const packetSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "plainEnglishSummary",
    "appealStrategy",
    "appealLetter",
    "doctorLetterRequest",
    "evidenceChecklist",
    "insurerCallScript",
    "deadlineChecklist",
    "warnings",
    "disclaimer",
  ],
  properties: {
    plainEnglishSummary: { type: "string" },
    appealStrategy: { type: "string" },
    appealLetter: { type: "string" },
    doctorLetterRequest: { type: "string" },
    evidenceChecklist: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["item", "whyNeeded", "status"],
        properties: {
          item: { type: "string" },
          whyNeeded: { type: "string" },
          status: { type: "string", enum: ["provided", "missing", "optional"] },
        },
      },
    },
    insurerCallScript: { type: "string" },
    deadlineChecklist: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["task", "dueDate", "priority"],
        properties: {
          task: { type: "string" },
          dueDate: { type: ["string", "null"] },
          priority: { type: "string", enum: ["high", "medium", "low"] },
        },
      },
    },
    warnings: { type: "array", items: { type: "string" } },
    disclaimer: { type: "string" },
  },
} as const;
