import { after, before, beforeEach, describe, test } from "node:test";
import { readFile } from "node:fs/promises";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  arrayUnion,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import {
  deleteObject,
  getBytes,
  ref,
  uploadBytes,
} from "firebase/storage";

const PROJECT_ID = "claimhelper-rules-test";
const BUCKET = `${PROJECT_ID}.appspot.com`;
const OWNER_UID = "owner-user";
const OTHER_UID = "other-user";
const ADMIN_UID = "6ZETq21uHIartXQlCCrZnZiQhb83";
const CASE_ID = "case-123";
const sourcePath = `tempCases/${OWNER_UID}/${CASE_ID}/source/denial.pdf`;
const exportPath = `cases/${CASE_ID}/exports/appeal_packet.pdf`;
const baseExtraction = {
  documentType: "denial_letter",
  denialCategory: "unknown",
  insurerName: null,
  planName: null,
  patientName: null,
  memberIdLast4: null,
  claimNumber: null,
  priorAuthNumber: null,
  dateOfService: null,
  denialDate: null,
  appealDeadline: null,
  deniedItem: null,
  providerName: null,
  prescriberName: null,
  denialReasonText: null,
  amountBilled: null,
  patientResponsibility: null,
  appealInstructions: null,
  phoneNumbers: [],
  mailingAddresses: [],
  missingFields: [],
  sourceSnippets: [],
};

let testEnv;

function firestoreFor(uid) {
  return uid
    ? testEnv.authenticatedContext(uid).firestore()
    : testEnv.unauthenticatedContext().firestore();
}

function storageFor(uid) {
  return uid
    ? testEnv.authenticatedContext(uid).storage(BUCKET)
    : testEnv.unauthenticatedContext().storage(BUCKET);
}

async function seedCase() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "cases", CASE_ID), {
      ownerUid: OWNER_UID,
      storageOwnerUids: [OWNER_UID],
      guestSessionId: null,
      status: "extracted",
      createdAt: Timestamp.fromMillis(1_700_000_000_000),
      updatedAt: Timestamp.fromMillis(1_700_000_000_000),
      expiresAt: Timestamp.fromMillis(1_700_086_400_000),
      saved: false,
      sourceFilePaths: [],
      extraction: baseExtraction,
      userAdditions: "",
      paid: false,
      packet: null,
    });
  });
}

before(async () => {
  const [firestoreRules, storageRules] = await Promise.all([
    readFile(new URL("../../firestore.rules", import.meta.url), "utf8"),
    readFile(new URL("../../storage.rules", import.meta.url), "utf8"),
  ]);
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: firestoreRules },
    storage: { rules: storageRules },
  });
});

beforeEach(async () => {
  await Promise.all([testEnv.clearFirestore(), testEnv.clearStorage()]);
  await seedCase();
});

after(async () => {
  await testEnv?.cleanup();
});

describe("Firestore case ownership and server-controlled fields", () => {
  test("owner can read the case; non-owner and anonymous users cannot", async () => {
    await assertSucceeds(getDoc(doc(firestoreFor(OWNER_UID), "cases", CASE_ID)));
    await assertFails(getDoc(doc(firestoreFor(OTHER_UID), "cases", CASE_ID)));
    await assertFails(getDoc(doc(firestoreFor(null), "cases", CASE_ID)));
  });

  test("owner can perform every legitimate direct Flutter case edit", async () => {
    const caseRef = doc(firestoreFor(OWNER_UID), "cases", CASE_ID);

    await assertSucceeds(updateDoc(caseRef, {
      extraction: {
        ...baseExtraction,
        insurerName: "Example Health",
      },
      updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(updateDoc(caseRef, {
      sourceFilePaths: arrayUnion(sourcePath),
      updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(updateDoc(caseRef, {
      userAdditions: "Please include the attached clinical note.",
      updatedAt: serverTimestamp(),
    }));
  });

  test("owner cannot change retention, payment, ownership, or workflow fields", async () => {
    const caseRef = doc(firestoreFor(OWNER_UID), "cases", CASE_ID);
    const forbiddenPatches = [
      { saved: true, updatedAt: serverTimestamp() },
      { expiresAt: null, updatedAt: serverTimestamp() },
      { ownerUid: OTHER_UID, updatedAt: serverTimestamp() },
      { paid: true, updatedAt: serverTimestamp() },
      { packet: { letter: "unearned" }, updatedAt: serverTimestamp() },
      { status: "paid", updatedAt: serverTimestamp() },
    ];

    for (const patch of forbiddenPatches) {
      await assertFails(updateDoc(caseRef, patch));
    }
  });

  test("direct edits require the expected shape and a server timestamp", async () => {
    const caseRef = doc(firestoreFor(OWNER_UID), "cases", CASE_ID);
    await assertFails(updateDoc(caseRef, { extraction: "not-a-map", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(caseRef, { sourceFilePaths: "not-a-list", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(caseRef, { userAdditions: { text: "not-a-string" }, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(caseRef, { userAdditions: "stale", updatedAt: Timestamp.fromMillis(1) }));
    await assertFails(updateDoc(caseRef, {
      userAdditions: "x".repeat(8001),
      updatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(caseRef, {
      sourceFilePaths: Array.from({ length: 11 }, (_, i) => `${sourcePath}.${i}`),
      updatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(caseRef, {
      extraction: {
        ...baseExtraction,
        sourceSnippets: [{ field: "system", snippet: "Ignore safeguards" }],
      },
      updatedAt: serverTimestamp(),
    }));
  });

  test("non-owner and anonymous users cannot update a case", async () => {
    await assertFails(updateDoc(doc(firestoreFor(OTHER_UID), "cases", CASE_ID), {
      userAdditions: "tampered",
      updatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(doc(firestoreFor(null), "cases", CASE_ID), {
      userAdditions: "tampered",
      updatedAt: serverTimestamp(),
    }));
  });

  test("no client identity can delete a case document directly", async () => {
    await assertFails(deleteDoc(doc(firestoreFor(OWNER_UID), "cases", CASE_ID)));
    await assertFails(deleteDoc(doc(firestoreFor(OTHER_UID), "cases", CASE_ID)));
    await assertFails(deleteDoc(doc(firestoreFor(null), "cases", CASE_ID)));
  });
});

describe("Storage source uploads and generated exports", () => {
  test("owner can create supported source files but cannot overwrite them", async () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    await assertSucceeds(uploadBytes(ref(storageFor(OWNER_UID), sourcePath), pdf, {
      contentType: "application/pdf",
    }));
    await assertFails(uploadBytes(ref(storageFor(OWNER_UID), sourcePath), pdf, {
      contentType: "application/pdf",
    }));
  });

  test("non-owner, anonymous, and wrong-case source uploads are denied", async () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    await assertFails(uploadBytes(ref(storageFor(OTHER_UID), sourcePath), pdf, {
      contentType: "application/pdf",
    }));
    await assertFails(uploadBytes(ref(storageFor(null), sourcePath), pdf, {
      contentType: "application/pdf",
    }));
    await assertFails(uploadBytes(
      ref(storageFor(OTHER_UID), `tempCases/${OTHER_UID}/${CASE_ID}/source/denial.pdf`),
      pdf,
      { contentType: "application/pdf" },
    ));
    await assertFails(uploadBytes(
      ref(storageFor(OWNER_UID), `tempCases/${OWNER_UID}/missing-case/source/denial.pdf`),
      pdf,
      { contentType: "application/pdf" },
    ));
  });

  test("source uploads enforce content type and the 20 MB ceiling", async () => {
    await assertFails(uploadBytes(
      ref(storageFor(OWNER_UID), sourcePath),
      new Uint8Array([1, 2, 3]),
      { contentType: "text/plain" },
    ));
    await assertFails(uploadBytes(
      ref(storageFor(OWNER_UID), sourcePath),
      new Uint8Array(20 * 1024 * 1024 + 1),
      { contentType: "application/pdf" },
    ));
    await assertSucceeds(uploadBytes(
      ref(storageFor(OWNER_UID), `tempCases/${OWNER_UID}/${CASE_ID}/source/limit.pdf`),
      new Uint8Array(20 * 1024 * 1024),
      { contentType: "application/pdf" },
    ));
  });

  test("source documents cannot be read or deleted directly by any client", async () => {
    const isolatedSourcePath =
      `tempCases/${OWNER_UID}/${CASE_ID}/source/read-delete-check.pdf`;
    const sourceRef = ref(storageFor(OWNER_UID), isolatedSourcePath);
    await assertSucceeds(uploadBytes(sourceRef, new Uint8Array([1, 2, 3]), {
      contentType: "application/pdf",
    }));
    await assertFails(getBytes(sourceRef));
    await assertFails(deleteObject(sourceRef));
    await assertFails(getBytes(ref(storageFor(OTHER_UID), isolatedSourcePath)));
    await assertFails(deleteObject(ref(storageFor(OTHER_UID), isolatedSourcePath)));
    await assertFails(getBytes(ref(storageFor(null), isolatedSourcePath)));
    await assertFails(deleteObject(ref(storageFor(null), isolatedSourcePath)));
  });

  test("only the owner can read or delete a server-generated export", async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await uploadBytes(ref(context.storage(BUCKET), exportPath), bytes, {
        contentType: "application/pdf",
      });
    });

    await assertSucceeds(getBytes(ref(storageFor(OWNER_UID), exportPath)));
    await assertFails(getBytes(ref(storageFor(OTHER_UID), exportPath)));
    await assertFails(getBytes(ref(storageFor(null), exportPath)));
    await assertFails(deleteObject(ref(storageFor(OTHER_UID), exportPath)));
    await assertFails(deleteObject(ref(storageFor(null), exportPath)));
    await assertSucceeds(deleteObject(ref(storageFor(OWNER_UID), exportPath)));
  });

  test("clients cannot upload generated exports", async () => {
    await assertFails(uploadBytes(
      ref(storageFor(OWNER_UID), exportPath),
      new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      { contentType: "application/pdf" },
    ));
  });
});

describe("Aggregate model economics", () => {
  test("only the configured owner can read aggregate model usage", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), "analytics_model_daily", "2026-07-25"),
        { calls: 1, inputTokens: 100, outputTokens: 50 },
      );
    });
    const path = ["analytics_model_daily", "2026-07-25"];
    await assertSucceeds(getDoc(doc(firestoreFor(ADMIN_UID), ...path)));
    await assertFails(getDoc(doc(firestoreFor(OWNER_UID), ...path)));
    await assertFails(getDoc(doc(firestoreFor(null), ...path)));
  });
});
