/**
 * Reviewed dataset for the /insurers/ appeal-guide pages (tool/build_insurers.mjs).
 * Same contract as codes_data.mjs: edit THIS file, re-run the generator, commit
 * the output — never hand-edit web/insurers/*.html.
 *
 * Accuracy rules (mirrors tools/guide-topics.md):
 * - Only high-confidence, generally-stated facts. Federal appeal rules (180-day
 *   internal window, 30/60-day decisions, 72-hour urgent, ~4-month external
 *   review) are stated as the general rule with "your letter controls".
 * - NEVER list mailing addresses or fax numbers — they vary by plan and state
 *   and go stale; every page directs readers to the appeal-rights section of
 *   their own denial letter, which is the authoritative source.
 * - Corporate facts (parent companies, PBM relationships, plan mix) kept at
 *   the "well-known, durable" level.
 */

export const insurers = [
  {
    slug: "unitedhealthcare",
    name: "UnitedHealthcare",
    short: "UHC",
    overview:
      "UnitedHealthcare (part of UnitedHealth Group) is the largest health insurer in the U.S., covering employer plans, ACA marketplace plans, Medicare Advantage, and Medicaid plans. Because the book of business is so broad, the exact appeal route depends on which UnitedHealthcare entity issued your denial — the letter itself names it.",
    portal: "the myuhc.com member portal",
    bullets: [
      "Check the top of your denial letter for the exact entity: many employer plans are administered by UMR (a UnitedHealthcare company) or reference Optum entities — your appeal goes to whichever administrator issued the letter.",
      "Most members can submit an appeal online through the member portal (look for the claims detail, then the appeal option), or by mail to the address in the letter's appeal-rights section.",
      "Pharmacy denials usually run through Optum Rx and have their own exception/appeal track — the drug denial notice states it.",
      "For prior-authorization denials, your doctor can request a peer-to-peer review with a UnitedHealthcare medical director — often the fastest lever before or alongside a written appeal.",
      "Keep the claim number and the reference/case number from the letter on everything you send.",
    ],
    special: null,
    faq: [
      {
        q: "My letter says UMR or Optum, not UnitedHealthcare — where do I appeal?",
        a: "To the entity on the letter. UMR and Optum are UnitedHealth Group companies that administer many employer plans; the appeal-rights section of the letter names the correct address and portal. The federal appeal rules and deadlines are the same.",
      },
      {
        q: "Can my doctor talk to UnitedHealthcare directly about a prior-auth denial?",
        a: "Yes — ask your doctor's office to request a peer-to-peer review with the plan's medical director. It's often faster than a written appeal and doesn't use up your formal appeal rights.",
      },
    ],
    guides: ["prior-authorization-denied", "not-medically-necessary"],
  },
  {
    slug: "aetna",
    name: "Aetna",
    short: "Aetna",
    overview:
      "Aetna is part of CVS Health and covers employer plans, ACA marketplace plans in some states, and a large Medicare Advantage book. Medical appeals go to Aetna; drug denials usually run through CVS Caremark, Aetna's pharmacy benefit manager, on a separate track.",
    portal: "the Aetna member website (aetna.com)",
    bullets: [
      "Submit medical appeals through your Aetna member account or by mail to the address in your denial letter's appeal-rights section.",
      "Prescription denials are typically handled by CVS Caremark — the drug denial notice has its own exception and appeal instructions, and your prescriber can file the exception request for you.",
      "Aetna commonly offers two internal appeal levels on employer plans — the letter states how many you get and the deadline for each.",
      "For urgent care denials, ask explicitly for an expedited appeal — federal rules require a decision within roughly 72 hours when your health is in jeopardy.",
    ],
    special: null,
    faq: [
      {
        q: "My medication was denied — do I appeal to Aetna or CVS Caremark?",
        a: "Check the letterhead of the denial notice. Pharmacy denials usually come from (and are appealed to) CVS Caremark as the pharmacy benefit manager, and formulary exception requests can be started by your prescriber. Medical service denials are appealed to Aetna itself.",
      },
      {
        q: "How many internal appeals do I get with Aetna?",
        a: "It depends on your plan — many employer plans include two internal levels, marketplace plans often one. Your denial letter must state your appeal levels and the deadline for each; after the final internal denial you can request independent external review.",
      },
    ],
    guides: ["formulary-exclusion-denial", "step-therapy-denial"],
  },
  {
    slug: "cigna",
    name: "Cigna",
    short: "Cigna",
    overview:
      "Cigna Healthcare focuses heavily on employer-sponsored coverage, with pharmacy benefits usually managed by Express Scripts (part of Cigna's Evernorth). Many Cigna employer plans are self-funded — meaning Cigna administers the plan but your employer funds it — which changes which external-review rules apply to you.",
    portal: "the myCigna member portal (mycigna.com)",
    bullets: [
      "Appeals can generally be started from the claim detail in myCigna or by mail to the address in the letter's appeal-rights section.",
      "Prescription denials usually run through Express Scripts with their own exception/appeal instructions on the notice.",
      "Because many Cigna plans are self-funded employer plans, check your letter or summary plan description: self-funded (ERISA) plans use the federal external review process rather than your state's program.",
      "Your HR or benefits team can tell you if the plan is self-funded — and for self-funded plans, the employer's plan administrator sometimes has discretion worth appealing to directly.",
    ],
    special: null,
    faq: [
      {
        q: "How do I know if my Cigna plan is self-funded, and why does it matter?",
        a: "Ask HR or check the summary plan description; denial letters often state it. Self-funded plans are governed by federal ERISA rules — state external-review programs and state insurance regulators generally don't apply, and your independent review runs through the federal process instead.",
      },
      {
        q: "Where do I appeal a prescription denial on a Cigna plan?",
        a: "Usually to Express Scripts, Cigna's pharmacy benefit manager — the denial notice names the right process. Your prescriber can also file a formulary exception with supporting clinical notes, which is often the faster path.",
      },
    ],
    guides: ["out-of-network-denial", "formulary-exclusion-denial"],
  },
  {
    slug: "blue-cross-blue-shield",
    name: "Blue Cross Blue Shield",
    short: "BCBS",
    overview:
      "Blue Cross Blue Shield is not one company — it's an association of dozens of independent, locally operated Blue plans (Horizon, Highmark, Florida Blue, CareFirst, Premera, and many more). Your appeal always goes to the specific Blue company named on your member ID card and denial letter, under that plan's process and your state's rules.",
    portal: "your local Blue plan's member portal (the exact site is on your ID card)",
    bullets: [
      "Identify your actual insurer first: the full company name is on your ID card and letterhead — that's who you appeal to, not the national association.",
      "If you received care in another state through BlueCard, appeals still generally go through your home plan (the one that issued your card).",
      "Each Blue plan has its own portal, forms, and addresses — the appeal-rights section of your denial letter is the authoritative source.",
      "State external review applies based on where your plan was issued; after the final internal denial, your letter must explain the external-review path for your plan.",
    ],
    special:
      "bcbs.com has an official directory for locating your local Blue company if the card isn't handy — but for an appeal, the denial letter's appeal-rights section always names the correct entity and address.",
    faq: [
      {
        q: "Which Blue Cross company do I actually appeal to?",
        a: "The one printed on your member ID card and denial letter (for example Horizon BCBSNJ, Highmark, Florida Blue). Blue plans are independent companies — the national association doesn't process appeals. The letter's appeal-rights section gives the correct address and deadline.",
      },
      {
        q: "I got care out of state through BlueCard — who handles the appeal?",
        a: "Generally your home plan — the Blue company that issued your ID card — even though a different Blue plan priced the claim locally. Start with the appeal instructions on your denial letter or EOB, and call the member services number on your card if it's unclear.",
      },
    ],
    guides: ["out-of-network-denial", "how-to-appeal-health-insurance-denial"],
  },
  {
    slug: "anthem",
    name: "Anthem (Elevance Health)",
    short: "Anthem",
    overview:
      "Anthem is the Blue-branded insurer operated by Elevance Health (renamed from Anthem, Inc. in 2022) in more than a dozen states, typically as Anthem Blue Cross or Anthem Blue Cross and Blue Shield. If your card says Anthem, your appeal goes to Anthem in your state — and your state's external-review rules apply to fully insured plans.",
    portal: "anthem.com or the Sydney Health app",
    bullets: [
      "Appeals can generally be filed through your Anthem member account, by phone, or by mail to the address in the letter's appeal-rights section.",
      "Anthem operates state by state — deadlines and external review depend on the state where your plan was issued, so use the letter (and your state regulator) rather than generic Anthem information found online.",
      "Prior-auth denials: ask your doctor about a peer-to-peer review with an Anthem medical director before or alongside the written appeal.",
      "Grievances (service complaints) and appeals (coverage disputes) are separate tracks — make sure your submission is filed as an appeal of an adverse benefit determination.",
    ],
    special: null,
    faq: [
      {
        q: "Is Anthem the same as Blue Cross Blue Shield?",
        a: "Anthem (owned by Elevance Health) is one of the independent Blue-licensed companies, operating Blue-branded plans in certain states. If Anthem issued your plan, you appeal to Anthem under your state's rules — other states' Blue plans are separate companies.",
      },
      {
        q: "What's the difference between an Anthem grievance and an appeal?",
        a: "An appeal challenges a coverage decision (a denial); a grievance complains about service or quality. If you want a denial overturned, file an appeal of the adverse benefit determination — the denial letter describes that process specifically.",
      },
    ],
    guides: ["prior-authorization-denied", "external-review"],
  },
  {
    slug: "humana",
    name: "Humana",
    short: "Humana",
    overview:
      "Humana today is primarily a Medicare Advantage and Medicare drug-plan insurer (it has been exiting employer group coverage). That matters for appeals: Medicare Advantage has its own federal appeal track with shorter deadlines and an automatic independent review — different from the commercial-plan process.",
    portal: "the MyHumana member portal",
    bullets: [
      "Medicare Advantage denials: you generally have 60 days to request reconsideration from the plan, and Humana must decide within federal timeframes (currently 30 days for pre-service standard requests, 72 hours expedited).",
      "If Humana upholds a Medicare Advantage denial, it is automatically forwarded to an independent review entity (IRE) — you don't have to request that second look.",
      "Ask your doctor to submit a supporting statement; for expedited review, a physician's statement that waiting endangers your health is what triggers the 72-hour clock.",
      "Drug denials on Medicare plans follow the Part D exception/appeal process — the pharmacy notice explains the steps and your prescriber can start the exception.",
    ],
    special:
      "If you have Humana through an employer (a shrinking group), the commercial rules on this site's general guides apply instead — check your letter for which process it describes.",
    faq: [
      {
        q: "How long do I have to appeal a Humana Medicare Advantage denial?",
        a: "Generally 60 days from the denial notice to request plan reconsideration. Urgent situations qualify for expedited review (a decision in about 72 hours) when a doctor confirms that waiting would jeopardize your health. Your notice states the exact deadline.",
      },
      {
        q: "What happens if Humana denies my appeal?",
        a: "On Medicare Advantage plans, an upheld denial is automatically sent to an independent review entity (IRE) for a fresh decision — and further levels (administrative law judge and beyond) exist above that. The reconsideration notice explains each step.",
      },
    ],
    guides: ["external-review", "how-to-appeal-health-insurance-denial"],
  },
  {
    slug: "kaiser-permanente",
    name: "Kaiser Permanente",
    short: "Kaiser",
    overview:
      "Kaiser Permanente is an integrated system — the insurer and the medical group are part of the same organization, operating in California and several other states plus D.C. Appeals go through Kaiser member services, and because most members are in California, the state's Independent Medical Review (IMR) through the DMHC is a powerful second step there.",
    portal: "kp.org",
    bullets: [
      "File the appeal (Kaiser calls many of these grievances) through kp.org, by phone with Member Services, or in writing per your denial letter — the letter states the deadline that applies to your plan.",
      "Because your doctors and the plan are one organization, ask your treating Kaiser physician to document medical necessity in the chart — internal reviewers read it.",
      "California members: after the internal process (or immediately for urgent cases), you can request Independent Medical Review through the DMHC — it's free, independent, and binding on the plan.",
      "Members outside California have equivalent external-review rights through their state's process or the federal process; the denial letter names the right one.",
    ],
    special: null,
    faq: [
      {
        q: "How do I appeal a Kaiser Permanente denial in California?",
        a: "Start with Kaiser's internal grievance/appeal via kp.org or Member Services. If the denial stands — or immediately in urgent cases — request Independent Medical Review (IMR) from the California DMHC. IMR is free, decided by independent physicians, and binding on Kaiser.",
      },
      {
        q: "Is a Kaiser grievance the same as an appeal?",
        a: "Kaiser uses 'grievance' broadly, but disputing a coverage or medical-necessity decision is an appeal of an adverse benefit determination and preserves your external-review rights. Say explicitly that you are appealing the denial and want it reviewed.",
      },
    ],
    guides: ["not-medically-necessary", "external-review"],
  },
  {
    slug: "ambetter",
    name: "Ambetter (Centene)",
    short: "Ambetter",
    overview:
      "Ambetter is Centene's ACA marketplace brand, sold through state-specific companies (Ambetter from …). Appeals follow the standard marketplace rules — internal appeal first, then external review — but always through your state's Ambetter entity, whose name is on your letter.",
    portal: "your state's Ambetter member portal (linked from ambetterhealth.com)",
    bullets: [
      "Your plan is issued by a state-specific Centene subsidiary — appeal to the entity named on the denial letter, using the address or portal it lists.",
      "Marketplace plans give you at least 180 days to file the internal appeal; the plan decides within 30 days for care you haven't received yet (72 hours if urgent).",
      "After the final internal denial, you're entitled to external review — your state's program or the federal HHS process, as stated in the letter.",
      "Centene also runs large Medicaid plans under other brands; if your coverage is actually Medicaid, you additionally have state fair-hearing rights with their own deadlines.",
    ],
    special: null,
    faq: [
      {
        q: "How long do I have to appeal an Ambetter denial?",
        a: "Marketplace plans must give you at least 180 days from the denial notice to file an internal appeal — but the exact date printed on your letter controls. Urgent denials qualify for expedited handling with a decision in roughly 72 hours.",
      },
      {
        q: "Who reviews my case if Ambetter denies the appeal?",
        a: "You can request independent external review after the final internal denial — through your state's external review program or the federal HHS-administered process, whichever your letter names. The reviewer's decision is binding on the plan.",
      },
    ],
    guides: ["how-to-appeal-health-insurance-denial", "external-review"],
  },
  {
    slug: "molina-healthcare",
    name: "Molina Healthcare",
    short: "Molina",
    overview:
      "Molina Healthcare focuses on Medicaid managed care, ACA marketplace plans, and Medicare plans. The appeal path depends on which of those you have — and Medicaid members have an extra, powerful right on top of the plan appeal: a state fair hearing.",
    portal: "the My Molina member portal",
    bullets: [
      "Check your letter for which line of business denied you — Medicaid, marketplace, and Medicare each follow a different appeal track, all described on the notice.",
      "Medicaid members: you generally must finish the plan's internal appeal first, then can request a state fair hearing — and if you appeal quickly (often within 10 days of the notice), you can usually keep receiving the disputed service while the appeal runs (aid paid pending).",
      "Marketplace members follow the standard route: internal appeal (at least 180 days to file), then independent external review.",
      "Ask Molina member services for the appeal form for your specific state plan, or file through the member portal.",
    ],
    special: null,
    faq: [
      {
        q: "What is a state fair hearing and when can I use it against a Molina denial?",
        a: "Medicaid members can have a state administrative judge review the denial after (in most states) completing Molina's internal appeal. Deadlines are strict and appear on the appeal-resolution notice. Filing fast — often within 10 days — usually lets you keep the disputed service during the process.",
      },
      {
        q: "Do I keep my services while appealing a Molina Medicaid denial?",
        a: "Often yes ('aid paid pending'): if you file the appeal within the short window printed on the notice, currently authorized services generally continue until the appeal is decided. Confirm the exact window on your notice — it's short.",
      },
    ],
    guides: ["how-to-appeal-health-insurance-denial", "external-review"],
  },
  {
    slug: "oscar-health",
    name: "Oscar Health",
    short: "Oscar",
    overview:
      "Oscar is a technology-focused insurer selling primarily ACA marketplace plans. Appeals follow the standard marketplace playbook — internal appeal, then independent external review — with most of the process manageable from the Oscar app or member portal.",
    portal: "the Oscar app or hioscar.com member portal",
    bullets: [
      "File the appeal from the claim detail in the app/portal, or by mail per the letter's appeal-rights section; Oscar's care team can confirm receipt by secure message.",
      "You have at least 180 days from the denial to file the internal appeal; decisions come within 30 days pre-service (72 hours expedited when urgent).",
      "After the final internal denial, request external review through the program named in your letter (state or federal HHS process depending on your state).",
      "Attach the clinical documentation up front — portal-filed appeals live or die on what's uploaded with them.",
    ],
    special: null,
    faq: [
      {
        q: "Can I file an Oscar appeal entirely in the app?",
        a: "Generally yes — start from the denied claim's detail view and follow the appeal option, uploading your appeal letter and supporting records. Mail remains available per your denial letter, and urgent cases can be expedited by phone.",
      },
      {
        q: "How long does an Oscar appeal take?",
        a: "Federal rules require a decision within 30 days for services you haven't received yet and 60 days for services already received; expedited appeals resolve in roughly 72 hours when a physician confirms urgency. Your letter states the timeline for your specific case.",
      },
    ],
    guides: ["how-to-appeal-health-insurance-denial", "prior-authorization-denied"],
  },
];
