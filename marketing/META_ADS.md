# Facebook / Instagram angle test (€5 a day)

Five ads, one per opening angle, all ending in the same dawn-print ad. The
point of the first week is to learn which angle brings people who go on to
press "Start" and upload — not just clicks. The owner creates the campaign
and pays for it in Ads Manager; nothing here spends money by itself.

## The files

`video/out/meta-ads/` (rendered by `node video/render.mjs --meta-ads`; not
committed — re-render from `video/library/dawn-ad/hooks.json` any time):

| Ad | Angle | Feed (4:5) | Reels / Stories (9:16) | Captions | Thumbnail |
|---|---|---|---|---|---|
| fb1 | Confusion | `getmyyes-fb1-4x5.mp4` | `getmyyes-fb1-9x16.mp4` | `getmyyes-fb1.en_US.srt` | `getmyyes-fb1-4x5-cover.jpg` / `-9x16-cover.jpg` |
| fb2 | Deadline | `getmyyes-fb2-4x5.mp4` | `getmyyes-fb2-9x16.mp4` | `getmyyes-fb2.en_US.srt` | same pattern |
| fb3 | Statistic | `getmyyes-fb3-4x5.mp4` | `getmyyes-fb3-9x16.mp4` | `getmyyes-fb3.en_US.srt` | same pattern |
| fb4 | Value | `getmyyes-fb4-4x5.mp4` | `getmyyes-fb4-9x16.mp4` | `getmyyes-fb4.en_US.srt` | same pattern |
| fb5 | Control | `getmyyes-fb5-4x5.mp4` | `getmyyes-fb5-9x16.mp4` | `getmyyes-fb5.en_US.srt` | same pattern |

Each is about 31–35 seconds: a 5–9 second voiced hook, then the 25.5 second
ad. In the 9:16 cut the words stay out of the top 14% and bottom 35% that
the Reels interface covers.

## Ads Manager, step by step

**1. Campaign**
- Create → objective **Traffic**.
- Name: `GetMyYes – angle test – Oct 2026`.
- Special ad categories: **none** (GetMyYes doesn't sell credit, insurance,
  housing or jobs). If Meta's review insists on *Financial products and
  services*, accept it: it only removes age and postcode targeting, which
  this test doesn't depend on.
- Advantage campaign budget: **off** (the budget goes on the ad set).
- A/B test: off.

**2. Ad set**
- Conversion location: **Website**.
- Performance goal: **Maximise number of link clicks**. (Not "landing page
  views": that needs the Meta pixel, and the site promises no pixel.)
- Budget: **Daily, €5.00**. Schedule: start today, no end date (stop it by
  hand after 7 days, about €35).
- Audience: location **United States**; age **25–64**; all genders;
  language English; no interests (Advantage+ audience is fine).
- Placements: **Advantage+ placements**.

**3. Ads** — make the first one, then duplicate it four times and swap the
video, text and link.
- Identity: the GetMyYes Facebook Page and Instagram account.
- Format: single image or video. Media: upload the **4:5** file; then,
  under the placement previews, open **Stories and Reels** and replace it
  with the **9:16** file. Set the matching cover as the thumbnail.
- Captions: Edit video → Captions → upload the `.en_US.srt` file.
- **Advantage+ creative enhancements: turn all of them off** — especially
  "add music" (it would lay generated music over the narration) and the
  text and visual touch-ups.
- If asked whether the ad uses AI-generated or digitally altered content:
  **yes** — the narration is an AI voice (ElevenLabs). The pictures are
  drawn, not photographs of people.
- Call to action: **Learn more**. Display link: `getmyyes.com`.
- Website URL: the tagged link below, exactly. The `utm_content` code is
  what lets `/#/stats → Top ads` show which ad people came from.

## Copy and links

Every line follows the house rules: no "your claim was denied" (Meta bans
copy that implies the viewer's health or money situation), no outcome
promises, statistics only with their source.

**fb1 · Confusion**
- Primary text: Insurance denial letters are written in plan language. GetMyYes turns one into plain English, line by line. The summary is free.
- Headline: Free plain-English denial summary
- Description: No card needed for the summary
- URL: `https://getmyyes.com/?utm_source=facebook&utm_medium=paid_social&utm_campaign=angle_test&utm_content=fb1`

**fb2 · Deadline**
- Primary text: Many health plans allow about 180 days for an internal appeal, and the exact deadline is in the letter. GetMyYes finds it and lays out the next steps in plain English.
- Headline: Find the appeal deadline in a letter
- Description: Free summary · no card
- URL: `https://getmyyes.com/?utm_source=facebook&utm_medium=paid_social&utm_campaign=angle_test&utm_content=fb2`

**fb3 · Statistic**
- Primary text: In published Marketplace data, fewer than 1% of denied claims were appealed. When people did appeal, about 4 in 10 denials were overturned (CMS data via KFF). Public numbers, not a prediction for any one case.
- Headline: Understand a denial in plain English
- Description: Free summary · no card
- URL: `https://getmyyes.com/?utm_source=facebook&utm_medium=paid_social&utm_campaign=angle_test&utm_content=fb3`

**fb4 · Value**
- Primary text: The plain-English summary is free. If you decide to appeal, $5 builds the packet: the appeal letter, an evidence checklist, a deadline tracker and a call script. You review it and send it yourself.
- Headline: Free summary. $5 appeal packet.
- Description: No card for the summary
- URL: `https://getmyyes.com/?utm_source=facebook&utm_medium=paid_social&utm_campaign=angle_test&utm_content=fb4`

**fb5 · Control**
- Primary text: GetMyYes never sends anything for you. You get the letter, the checklist and the call script, and you decide what happens next. Start with a free plain-English summary.
- Headline: Your appeal, sent by you
- Description: Free summary · no card
- URL: `https://getmyyes.com/?utm_source=facebook&utm_medium=paid_social&utm_campaign=angle_test&utm_content=fb5`

## Reading the result

- Meta will put most of the €5 behind one or two ads within a couple of
  days. That is normal; the others still get enough to compare.
- In Ads Manager: link click-through rate (above 1% is healthy for cold
  traffic) and cost per link click.
- In `getmyyes.com/#/stats`: **Top ads** shows visits per fb code; select
  one to see its start clicks and uploads. Judge on those, not on clicks:
  an ad that brings uploads at a higher click price is the better ad.
- After 7 days, keep the best one or two, pause the rest, and make the next
  round of hooks around the winning angle (add them to `hooks.json` as fb6
  onwards; the stats allow fb1–fb12).

The fb2 narration says "the clock starts on the date on the letter". The
rules count from when the letter is *received*, so the date printed on the
letter is the cautious reading, the same one the site's deadline check uses.
