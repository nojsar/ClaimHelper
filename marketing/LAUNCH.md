# GetMyYes launch kit — Product Hunt, Hacker News, directories

Goal: permanent backlinks + a spike of qualified attention. Everything here is
paste-ready; personalize lightly so it sounds like you. Launching is manual by
design — no bought upvotes, no DM campaigns, no engagement rings (they get
launches flagged and accounts banned).

**Before launching (both platforms):**
- [ ] `support@getmyyes.com` must reliably receive mail (real mailbox, not lossy forwarding) — signups and press replies go there.
- [ ] Skim the live site end-to-end once: upload flow with a test letter, preview, purchase page.
- [ ] Have the social accounts announce launch day (the autopilot posts guides, so post the launch manually from each account).

---

## 1. Product Hunt

**Mechanics**
- Self-hunting is fine in 2026 — no need to find a "hunter".
- Launch at **12:01 AM Pacific**, Tuesday/Wednesday/Thursday (full 24h on the board; weekends are quieter but easier to rank — fine too for a first launch).
- Reply to **every** comment on launch day. That's the whole growth hack.
- Do NOT ask friends to make accounts just to upvote (PH discounts new-account votes and can flag the launch).

**Listing copy**

- Name: `GetMyYes`
- Tagline (≤60 chars): `Turn a health-insurance denial into a ready-to-send appeal`
- Topics: Health & Fitness · Artificial Intelligence · Web App
- Description (≤260 chars):

> Upload a denial letter. GetMyYes reads the codes, fine print, and deadlines, then drafts your appeal letter, evidence checklist, doctor letter request, and call script. Free preview, $39 for the full packet. No subscription, no cookies, no data resale.

**First comment (maker story — post immediately after launch):**

> Hi PH 👋 Solo founder here.
>
> Regulators publish the numbers every year: US insurers deny a meaningful share of claims, and almost nobody appeals — yet appeals succeed remarkably often (we compiled the sourced data here: getmyyes.com/insurer-denial-rates). The appeal process isn't hard because the arguments are hard — it's hard because it's paperwork with deadlines, written in a language designed to make you give up.
>
> GetMyYes reads the actual denial letter — the CARC codes, the "not medically necessary" rationale, the appeal deadline — and drafts the whole response packet: appeal letter, evidence checklist, a letter request for your doctor, and a call script. You review everything before anything is sent; it's a drafting assistant, not a robo-lawyer.
>
> Things I cared about: free preview before any payment ($39 one-time, no subscription), no analytics cookies, self-hosted everything, delete-your-account button that actually deletes. There's also a free layer with no signup: plain-English appeal guides, a denial-code decoder, and a deadline calculator.
>
> I'd love blunt feedback — especially from anyone who's fought a denial themselves. AMA all day.

**Gallery (prepare before launch):**
- [ ] Screenshot: landing page (hero)
- [ ] Screenshot: upload → analysis view (use the mock-mode test letter)
- [ ] Screenshot: appeal packet preview
- [ ] The site og-image.png as the social card
- Optional: 30–60s screen recording of upload → packet (PH loves a video first slide)

---

## 2. Hacker News ("Show HN")

HN rules of engagement: no marketing voice, no emoji, no "we're excited to
announce". Lead with the problem and the engineering. Never ask anyone to
upvote (HN detects voting rings; the site penalizes it). One submission,
weekday ~8–10 AM US Eastern.

**Title:**

```
Show HN: Turn a health-insurance denial letter into a ready-to-send appeal
```

**URL:** `https://getmyyes.com`

**Text (first comment, posted by you as submitter):**

> Regulator data shows only a tiny fraction of denied health-insurance claims are ever appealed, while appeals that do get filed succeed at striking rates (sources compiled: https://getmyyes.com/insurer-denial-rates). The gap isn't legal complexity — it's that the process is deadline-driven paperwork written to be abandoned.
>
> GetMyYes ingests the actual denial letter (PDF/photo), classifies the denial type from the codes and rationale, and drafts the response packet: appeal letter, evidence checklist, doctor letter request, call script, with the deadlines extracted. Everything is reviewed by the user before it goes anywhere — it drafts, it doesn't send.
>
> Stack notes for the curious: Flutter web + Firebase (functions do the LLM calls; the app ships with a full mock mode), Stripe for one-time payments (no subscription), first-party cookie-less analytics, and all marketing pages are static HTML generated from reviewed datasets in the repo — no CMS. The privacy posture is strict by design (health-adjacent data): no third-party assets anywhere, no trackers, account deletion actually deletes.
>
> Free tier needs no signup: plain-English appeal guides, a CARC denial-code decoder, and an appeal-deadline calculator. The paid packet is $39 one-time with a free preview.
>
> Honest limitations: US plans only; it's a drafting assistant, not legal advice; success depends on the underlying clinical facts. Happy to answer anything about the appeal-rules research or the build.

**On launch day:** watch the thread all day; answer technical questions
directly; concede valid criticism immediately (HN rewards it).

---

## 3. Free directories (backlinks; ~15 min each)

Submit with: name `GetMyYes`, URL `https://getmyyes.com`, logo
`web/icons/Icon-512.png`, tagline + description from the PH section above,
contact `support@getmyyes.com`.

| Directory | URL | Notes |
|---|---|---|
| AlternativeTo | alternativeto.net | list as alternative to manual appeals / patient-advocate services |
| SaaSHub | saashub.com | straightforward form |
| There's An AI For That | theresanaiforthat.com | AI-tool directory, big traffic |
| Futurepedia | futurepedia.io | AI-tool directory |
| Uneed | uneed.best | launch-calendar style, pick a free slot |
| MicroLaunch | microlaunch.net | indie launch platform |
| Peerlist Launchpad | peerlist.io/launchpad | weekly launches, dev audience |
| Indie Hackers | indiehackers.com | create product page + a "building in public" post |
| Startup Base | startupbase.io | quick listing |
| ToolFinder | toolfinder.co | productivity-tool directory |

Also worth a listing (free, health-specific credibility): none that accept
tools without review — patient-advocacy resource pages are relationship-based;
handle separately and personally, never in bulk.

---

## 4. Sequencing recommendation

1. Fix the `support@` mailbox (blocker for everything).
2. Directories first (any order, spread over a week — steady trickle of links).
3. Product Hunt launch (pick a Tue/Wed/Thu).
4. Show HN ~1 week after PH (don't do both the same day; you can't answer two
   comment floods at once).
5. Announce each launch from the social accounts manually; the autopilot keeps
   posting guides regardless.
