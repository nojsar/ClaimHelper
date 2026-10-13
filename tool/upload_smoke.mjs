/**
 * The release's real upload check. A visitor's path, end to end against
 * production: sign in as a guest, open an upload session, put one tiny image
 * through the Storage rules, then delete the case and the guest account.
 *
 *   node tool/upload_smoke.mjs
 *
 * Why it exists: in October 2026 every upload failed with a Storage 403 for
 * weeks (the rules' cross-service Firestore read lost its IAM role) while
 * every emulator test passed. Only a real upload against production shows it.
 * The session is flagged releaseCheck, so it is not counted in analytics.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const options = await readFile(path.join(root, "lib", "firebase_options.dart"), "utf8");
const web = options.slice(options.indexOf("static const FirebaseOptions web"));
const field = (name) => web.match(new RegExp(`${name}: '([^']+)'`))?.[1];
const apiKey = field("apiKey");
const projectId = field("projectId");
const bucket = field("storageBucket");
if (!apiKey || !projectId || !bucket) throw new Error("upload check: web Firebase options not found.");
const functionsBase = `https://us-central1-${projectId}.cloudfunctions.net`;

// A valid 1x1 white JPEG.
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64",
);

async function json(response, step) {
  const text = await response.text();
  if (!response.ok) throw new Error(`upload check: ${step} failed with HTTP ${response.status}: ${text.slice(0, 300)}`);
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

const guest = await json(
  await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ returnSecureToken: true }),
  }),
  "guest sign-in",
);
const idToken = guest.idToken;
let caseId = null;
let failure = null;
try {
  const session = await callable("createCaseUploadSession", idToken, { consentConfirmed: true, releaseCheck: true });
  caseId = session.caseId;
  const name = `${session.uploadPathPrefix}release-check-${Date.now()}.jpg`;
  const upload = await fetch(
    `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(name)}`,
    { method: "POST", headers: { Authorization: `Firebase ${idToken}`, "Content-Type": "image/jpeg" }, body: JPEG },
  );
  if (upload.status === 403) {
    throw new Error(
      "upload check: Storage refused the upload (403). If storage.rules did not change, check that " +
      `service-<project number>@gcp-sa-firebasestorage.iam.gserviceaccount.com still has the ` +
      "'Firebase Rules Firestore Service Agent' role (the rules read the case from Firestore).",
    );
  }
  await json(upload, "Storage upload");
  console.log("[upload-check] A guest upload reached Storage through the production rules.");
} catch (error) {
  failure = error;
} finally {
  if (caseId) await callable("deleteCaseAndFiles", idToken, { caseId }).catch((e) => console.warn(`[upload-check] cleanup: ${e.message}`));
  await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  }).catch(() => {});
}
if (failure) {
  console.error(failure.message);
  process.exit(1);
}
