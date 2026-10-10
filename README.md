# ClaimHelper

**Turn your denied medication or treatment letter into a ready-to-send appeal packet in 15 minutes.**

ClaimHelper is a clean healthcare utility that helps U.S. users turn a health-insurance denial
letter, EOB, or prior-authorization denial into a ready-to-review appeal packet. It is a **document
drafting assistant** — not medical advice, not legal advice, not insurance representation, and it
does not decide medical necessity or guarantee approval.

Optimized for high-value denials: medication denials (ADHD, GLP‑1/weight-loss, migraine,
autoimmune/specialty, mental-health), prior authorization, "not medically necessary," and step
therapy / formulary exceptions.

---

## Table of contents

1. [Architecture](#architecture)
2. [Repository layout](#repository-layout)
3. [Quick start (demo/mock mode — no Firebase needed)](#quick-start-demomock-mode)
4. [Flutter setup](#flutter-setup)
5. [Firebase project setup](#firebase-project-setup)
6. [Cloud Functions deploy](#cloud-functions-deploy)
7. [OpenAI environment variables](#openai-environment-variables)
8. [Stripe env vars & webhook](#stripe-env-vars--webhook)
9. [Local emulator instructions](#local-emulator-instructions)
10. [Security rules](#security-rules)
11. [Privacy & data retention](#privacy--data-retention)
12. [Tests](#tests)
13. [Sample documents for testing](#sample-documents-for-testing)

---

## Architecture

```
Flutter (web / iOS / Android)
  │  Riverpod state · go_router · typed models · repository/service layer
  │
  ├── Firebase Auth (anonymous guest sessions; email link on save/purchase)
  ├── Cloud Firestore (cases, users, purchases)   ← client reads/writes non-privileged fields only
  ├── Firebase Storage (source uploads, exports)  ← owner-scoped, size/type limited
  │
  └── Firebase Cloud Functions (TypeScript)   ← the ONLY place secrets live
        ├── OpenAI Responses API (file/image input + Structured Outputs, store:false)
        └── Stripe (Checkout + webhook)
```

**The OpenAI API key is never shipped to the Flutter client.** All model calls happen inside Cloud
Functions. The client only ever sees structured JSON results.

Key design choices:

- **OpenAI Responses API** (not Chat Completions) with `input_file` / `input_image` parts for PDFs
  and photos, **Structured Outputs** (`text.format` → `json_schema`, `strict: true`) for reliable
  extraction/packet JSON, and `store: false` so requests aren't retained.
- **Model is configurable** via `OPENAI_MODEL` — never hardcoded at call sites (see
  `functions/src/config.ts`).
- **Payments are abstracted** behind a `PaymentService`-style flow: Stripe Checkout for web today,
  with mobile IAP/RevenueCat addable later. The mobile paywall UI is present but isolated.
- **`Backend` interface** with two implementations: `FirebaseBackend` (production) and
  `MockBackend` (in-memory, for demos/tests). Swap with `--dart-define=USE_MOCKS=true`.
- **Paid fulfillment is browser-independent**: a verified Stripe payment creates a pending
  fulfillment state, a Firestore trigger generates the packet, and a scheduled watchdog retries
  interrupted work. Firestore generation leases prevent duplicate model calls when the browser,
  trigger, and retry worker overlap.
- **AI telemetry is aggregate-only**: daily operation counters record token totals, latency buckets,
  success/error counts, and estimated model cost without prompts, outputs, case IDs, or user IDs.
- **Model-call abuse controls are server-side**: extraction and free-preview calls use separate,
  atomic per-user hourly allowances, and a completed paid packet is immutable/idempotent so an
  undocumented client flag cannot trigger duplicate paid generation.

---

## Repository layout

```
claimhelper/
├── lib/
│   ├── main.dart                 # entry; initializes Firebase (skipped in mock mode)
│   ├── app_router.dart           # go_router routes
│   ├── firebase_options.dart     # placeholder — regenerate with flutterfire configure
│   ├── core/                     # constants (copy/disclaimers), theme
│   ├── models/                   # typed models: extraction, guided_answers, packet, appeal_case
│   ├── services/                 # Backend interface + Firebase/Mock impls + PdfService
│   ├── state/                    # Riverpod providers + intake controller
│   ├── widgets/                  # shared scaffold, disclaimer chip, error/retry
│   └── features/
│       ├── home/                 # 1. Landing
│       ├── upload/               # 2. Upload + consent
│       ├── processing/           # 3. Processing
│       ├── extraction/           # 4. Extraction review (editable)
│       ├── guided/               # 5. Guided questions
│       ├── preview/              # 6. Preview + paywall + purchase success
│       ├── packet/               # 7. Appeal packet tabs + PDF export
│       ├── account/              # 8. Account / saved cases
│       └── settings/             # 9. Settings / privacy
├── functions/                    # Firebase Cloud Functions (TypeScript)
│   ├── src/
│   │   ├── index.ts              # exports all callables + webhook + scheduler
│   │   ├── config.ts             # secrets + configurable model/price/TTL
│   │   ├── rate_limit.ts         # atomic per-user model-call allowances
│   │   ├── cases.ts              # createCaseUploadSession, deleteCaseAndFiles, saveCase
│   │   ├── extraction.ts         # extractDenialFromUploadedFile (OpenAI)
│   │   ├── preview.ts            # generateFreePreview
│   │   ├── packet.ts             # generateAppealPacket, saveGuidedAnswers
│   │   ├── payments.ts           # createCheckoutSession, stripeWebhook
│   │   ├── cleanup.ts            # scheduledCleanupExpiredFiles
│   │   └── openai/               # client, prompts, JSON schemas
│   └── .env.example
├── video/                        # Remotion project: the social post media
│   ├── src/guide/DawnGuide.tsx   # narrated guide post, square + vertical
│   └── render.mjs                # renders into web/media/social/ (committed)
├── firestore.rules
├── storage.rules
├── firestore.indexes.json
├── firebase.json
└── test/                         # extraction parsing, guided validation, packet serialization, entitlement
```

Marketing automation (guide library, social posting, and the Remotion videos
those posts carry) is documented in `MARKETING_AUTOPILOT.md` and `video/README.md`.

---

## Quick start (demo/mock mode)

Run the entire flow — upload → extract → preview → pay → packet → PDF → delete — with **no Firebase
project and no OpenAI key**. The mock backend returns realistic canned data.

```bash
cd claimhelper
flutter pub get
flutter run -d chrome --dart-define=USE_MOCKS=true
```

A "demo mode" banner appears in Settings. Payments resolve instantly (no Stripe), and the AI is
mocked. This is the fastest way to see the product and is what the tests exercise.

---

## Flutter setup

Requires **Flutter 3.44+ / Dart 3.6+**.

```bash
flutter --version          # confirm 3.44.x or newer
flutter config --enable-web
cd claimhelper
flutter pub get
flutter run -d chrome                       # real backend (needs Firebase configured)
flutter run -d chrome --dart-define=USE_MOCKS=true   # mock backend
```

Static checks and tests:

```bash
flutter analyze
flutter test
```

---

## Firebase project setup

1. Create a Firebase project (e.g. `claimhelper-dev`) at <https://console.firebase.google.com>.
2. Enable **Authentication** → Sign-in methods → **Anonymous** and **Email/Password**.
3. Create **Cloud Firestore** (production mode) and **Storage**.
4. Install tooling:

   ```bash
   npm install -g firebase-tools
   dart pub global activate flutterfire_cli
   firebase login
   ```

5. Generate real client config (replaces the placeholder `lib/firebase_options.dart`):

   ```bash
   cd claimhelper
   flutterfire configure --project claimhelper-dev
   ```

6. Update `.firebaserc` if your project id differs from `claimhelper-dev`.
7. Deploy rules and indexes:

   ```bash
   firebase deploy --only firestore:rules,storage,firestore:indexes
   ```

> The client config values in `firebase_options.dart` are **not secrets** — they identify the
> project. The sensitive keys (OpenAI, Stripe) live only in Cloud Functions.

---

## Cloud Functions deploy

```bash
cd functions
npm install
npm run build        # tsc typecheck + compile

# set server-side secrets (never committed)
firebase functions:secrets:set OPENAI_API_KEY
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
firebase functions:secrets:set ANALYTICS_UNIQUE_SALT

# set plain config (model, price, base url, TTL) as function env
#   Either via functions/.env (loaded automatically) or the console.
firebase deploy --only functions
```

The functions require the **Blaze (pay-as-you-go)** plan (Cloud Functions + outbound network to
OpenAI/Stripe).

Deployed functions:

| Function | Type | Purpose |
| --- | --- | --- |
| `createCaseUploadSession` | callable | Creates the case doc + returns the upload path prefix. Requires consent. |
| `extractDenialFromUploadedFile` | callable | Sends uploaded PDFs/images to OpenAI Responses API; stores structured extraction; enforces a bounded hourly allowance. |
| `generateFreePreview` | callable | Free-tier summary, amount at stake, likely appeal path. |
| `saveGuidedAnswers` | callable | Persists guided-question answers. |
| `createCheckoutSession` | callable | Starts $39 Stripe Checkout for web. |
| `stripeWebhook` | HTTP | Verifies signature; the only path that sets `paid=true`. |
| `generateAppealPacket` | callable | Paid: drafts the full packet (entitlement enforced server-side). |
| `fulfillPaidPacket` | Firestore trigger | Starts packet generation after verified payment grants entitlement. |
| `repairPaidPacketFulfillment` | scheduler | Retries interrupted or stale paid fulfillment with bounded attempts. |
| `deleteCaseAndFiles` | callable | Deletes the Firestore doc + all Storage files. |
| `scheduledCleanupExpiredFiles` | scheduler | Hourly: deletes expired unsaved cases and their files. |
| `trackEvent` | HTTP | Writes aggregate traffic counts and secret-keyed unique-country sketches. |

`ANALYTICS_UNIQUE_SALT` must be a randomly generated server-only value. Keep it
stable while a unique-visitor sketch version is active: rotating it makes old
and new registers incompatible, so a rotation must also increment the sketch
version in the Functions and dashboard code and begin a fresh 30-day series.

---

## OpenAI environment variables

Set in `functions/.env` (plain config) and via `functions:secrets:set` (the key):

| Var | Where | Default | Notes |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | secret | — | **Server-only.** Never in the Flutter app. |
| `OPENAI_MODEL` | env | `gpt-5.6-terra` | Configurable; not hardcoded at call sites. |
| `OPENAI_REASONING_EFFORT` | env | `high` | Explicit quality/latency setting for GPT-5.6 Terra. |
| `OPENAI_INPUT_COST_PER_MILLION` | env | `2.5` | Reporting estimate only; USD per million input tokens. |
| `OPENAI_CACHED_INPUT_COST_PER_MILLION` | env | `0.25` | Reporting estimate only; USD per million cached input tokens. |
| `OPENAI_OUTPUT_COST_PER_MILLION` | env | `15` | Reporting estimate only; USD per million output tokens. |

Implementation notes (`functions/src/openai/`):

- Uses `client.responses.create({ ..., store: false, text: { format: { type: "json_schema", strict: true }}})`.
- Uses GPT-5.6 Terra with explicit `high` reasoning; the model and effort remain configurable.
- PDFs are sent as `input_file` (base64 data URL); photos as `input_image`. 45 MB combined cap.
- Prompts instruct the model to extract only present facts, return `null` for unknowns, and never
  invent medical facts or claim medical necessity.
- Every operation has an explicit output-token budget. Deterministic model-contract tests run under
  `npm test`; an optional paid smoke evaluation can be run with
  `RUN_LIVE_MODEL_EVAL=1 npm run eval:model`.

---

## Stripe env vars & webhook

| Var | Where | Notes |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | secret | `sk_test_...` in dev. |
| `STRIPE_WEBHOOK_SECRET` | secret | `whsec_...` from the webhook endpoint. |
| `APP_BASE_URL` | env | Used to build Checkout success/cancel URLs. |
| `FULL_PACKET_PRICE_CENTS` | env | Defaults to `3900` ($39). |
| `FULL_CASE_PRICE_CENTS` | env | Defaults to `5900` ($59 total). |
| `FULL_CASE_UPGRADE_PRICE_CENTS` | env | Defaults to `2000` ($20 after a packet purchase). |
| `FULL_CASE_ROUNDS_CAP` | env | Defaults to `10` follow-up drafting rounds. |
| `FOLLOWUP_ROUND_PRICE_CENTS` | env | Defaults to `1900` ($19 per additional round). |

Set up the webhook:

```bash
# Local testing with the Stripe CLI:
stripe listen --forward-to http://localhost:5001/<project>/us-central1/stripeWebhook
# In production, add an endpoint in the Stripe Dashboard pointing at the deployed
# stripeWebhook URL and subscribe to:
# checkout.session.completed
# checkout.session.expired
# checkout.session.async_payment_succeeded
# checkout.session.async_payment_failed
```

The webhook verifies the signature and marks the case `paid` in a transaction; the client can never
grant itself entitlement (enforced by Firestore rules). Verified payment also creates a pending
fulfillment state so packet generation continues even if the customer closes the browser.

---

## Local emulator instructions

```bash
# 1. Build functions
cd functions && npm install && npm run build && cd ..

# 2. Provide local secrets for the emulator
cp functions/.env.example functions/.env.local
#   edit functions/.env.local — add a real OPENAI_API_KEY / Stripe test keys

# 3. Start the emulator suite (auth, functions, firestore, storage, hosting, UI)
firebase emulators:start
```

- Emulator UI: <http://localhost:4000>
- Hosting (built web app): <http://localhost:5000>
- To point the Flutter app at emulators, run against them from `main.dart` (add
  `useFirestoreEmulator`, `useFunctionsEmulator`, etc.) or simply use `--dart-define=USE_MOCKS=true`
  for a no-backend demo.

Build the web app for hosting:

```bash
flutter build web
firebase deploy --only hosting
```

---

## Security rules

- **Firestore** (`firestore.rules`): cases are created only by Cloud Functions; owners may read and
  update their own case's non-privileged fields, but **cannot** touch `paid`, `pricePaid`,
  `stripeSessionId`, `packet`, `preview`, `ownerUid`, or timestamps. `purchases` are read-only to
  the owner and written only by the webhook.
- **Storage** (`storage.rules`): source uploads are owner-scoped, limited to PDF/JPG/PNG/HEIC/WebP
  and 20 MB per file. Exports are read-only to the owner; writes come from Functions.

---

## Privacy & data retention

- **Consent before upload**: the user must confirm documents may contain sensitive health/insurance
  data and will be processed by AI.
- **Disclaimers everywhere**: not medical/legal advice, not insurance representation, no guarantee of
  approval, review before sending.
- **Retention**: uploaded source files auto-delete after **24 hours** unless the case is saved or
  paid (`scheduledCleanupExpiredFiles`). Paid/saved cases set `expiresAt = null`.
- **Deletion**: "Delete case and files" and Settings → "Delete all data" hard-delete Firestore docs
  and Storage files.
- **No analytics on document contents. No training on user documents.** (`store: false` on OpenAI.)
- **U.S.-only at launch.**

---

## Tests

```bash
flutter test
```

Covers:

- `test/extraction_parsing_test.dart` — extraction JSON parsing (full payload, nulls→unknown, bad
  enums, round-trip).
- `test/guided_validation_test.dart` — guided-question validation + serialization.
- `test/packet_serialization_test.dart` — packet & preview data-model serialization.
- `test/entitlement_test.dart` — paywall entitlement logic.
- `test/widget_test.dart` — landing screen smoke test.

---

## Sample documents for dev/testing

- CMS sample EOB — <https://www.cms.gov/files/document/11819-sample-explanation-benefits-508.pdf>
- Meritain "How to read your EOB" — <https://www.woodcountyohio.gov/DocumentCenter/View/1729/Meritain-How-to-Read-Your-Explanation-of-Benefits-PDF>
- WA OIC "not medically necessary" appeal example — <https://www.insurance.wa.gov/sites/default/files/2024-09/example-of-not-medically-necessary-appeal-letter.pdf>
- WA L&I EOB code list — <https://www.lni.wa.gov/patient-care/_docs/EOBList.pdf>
- NAIC denied-claims consumer guide — <https://content.naic.org/sites/default/files/consumer-health-insurance-appeal-denied-claims.pdf>

---

## Disclaimer

ClaimHelper is a document drafting assistant. It does not provide medical advice, legal advice, or
insurance representation, and it does not decide medical necessity. There is no guarantee any appeal
will be approved. Always review every document before sending it and confirm deadlines directly with
your insurer.
