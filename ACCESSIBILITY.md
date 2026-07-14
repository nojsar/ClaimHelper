# Accessibility engineering standard

## Scope and target

GetMyYes targets **WCAG 2.2 Level AA** across each full page and the complete customer process: landing page, appeal guides, upload, extraction review, guided questions, preview, authentication, Stripe checkout, confirmation, case management, packet review, and export.

This is an engineering target, not a claim of government certification. The U.S. Department of Justice applies Title III's equal-access and effective-communication duties to public-facing business services on the web, but does not currently prescribe a detailed Title III website standard or issue an “ADA certified” badge. WCAG conformance requires evaluation of full pages and complete processes; automated tools alone cannot establish it.

Primary references:

- DOJ, [Guidance on Web Accessibility and the ADA](https://www.ada.gov/resources/web-guidance/)
- W3C, [Web Content Accessibility Guidelines 2.2](https://www.w3.org/TR/WCAG22/)
- W3C, [Evaluating Web Accessibility](https://www.w3.org/WAI/test-evaluate/)
- W3C, [WCAG-EM conformance evaluation](https://www.w3.org/WAI/test-evaluate/conformance/)
- W3C, [PDF3: correct reading and tab order in tagged PDF](https://www.w3.org/WAI/WCAG21/Techniques/pdf/PDF3)
- W3C, [Understanding conforming alternate versions](https://www.w3.org/WAI/WCAG22/Understanding/conformance.html#understanding-conforming-alternate-versions)

## Release checks

Run these checks after a shared component, template, or critical workflow changes:

```powershell
flutter analyze
flutter test
flutter build web
node tool/marketing_build.mjs
node tool/accessibility_check.mjs web
npx --yes html-validate@10.10.0 "web/**/*.html"
node tool/rendered_accessibility_check.mjs build/web
```

For a production release, use the fail-closed release command instead of
running `firebase deploy` directly:

```powershell
node tool/deploy_release.mjs
```

This runs the Flutter, Functions, dependency-audit, Firebase security-rule,
static-markup, and rendered axe checks; regenerates and validates the static
content; builds the deploy artifact; deploys every Firebase resource in
`firebase.json`; and then verifies that every production page and critical app
bundle matches the tested artifact. Use `node tool/deploy_release.mjs
--check-only` when a non-deploying release rehearsal is needed. A local pass is
not production evidence until the post-deploy verification also passes. This
command fails closed for the automated gates; it does not replace the manual
and assistive-technology checks below.

Automated checks are only a regression floor. Before claiming conformance for a release, manually test a representative sample and every unique step in the complete process:

- Keyboard only: logical order, visible and unobscured focus, no traps, dialogs enter and return focus.
- NVDA with current Chrome and Firefox on Windows.
- VoiceOver with current Safari on macOS and iOS.
- Browser text resize to 200% and page zoom/reflow at 400% (320 CSS-pixel viewport).
- Windows forced-colors/high-contrast mode and `prefers-reduced-motion`.
- Touch input and target sizing on a small mobile viewport.
- Form labels, instructions, required state, error association, error summary, and preservation of entered data.
- Upload progress, processing state, payment result, and other dynamic updates announced without stealing focus.
- Stripe-hosted checkout and the return/confirmation path.
- On-screen packet as the accessible equivalent for downloadable PDF content.
- Send and receive a test message through `support@getmyyes.com` so the
  documented accommodation channel is operational, not merely published.

Record browser, assistive technology, viewport, tested routes, findings, fixes, reviewer, and date. Include users with disabilities in periodic usability reviews when feasible.

## Current external-format and third-party gates

The downloadable appeal packet is currently generated with the Dart `pdf`
package. Its output does not expose the tagged document structure required for
reliable screen-reader reading order, so the PDF is a convenience copy and is
not represented as a PDF/UA or accessible PDF. The complete on-screen packet
must remain available as the equivalent accessible format, and support must
provide the same content in an accessible format on request. Do not claim the
download itself conforms until a tagged-PDF generator is adopted and the
result passes PAC/Acrobat checks plus manual screen-reader reading-order tests.
Reliance on the on-screen version for overall WCAG conformance is valid only if
that version itself meets Level AA, contains the same current information and
functionality in the same language, and the PDF can only be reached through a
page that also exposes the conforming version.

Stripe-hosted Checkout is third-party content in the complete purchase
process. Test the live Checkout page with keyboard-only navigation, NVDA with
Chrome and Firefox, and VoiceOver with Safari. Record the Stripe Checkout
version/date and every payment method exercised. A local Flutter or static HTML
test cannot clear this gate; unresolved payment blockers require an equivalent
supported purchase path while Stripe remediates them.

## Release evidence

Keep one record per production release containing:

- Git commit and Firebase release identifier.
- Output from `tool/deploy_release.mjs` and `tool/production_verify.mjs`.
- Automated test versions and results.
- Manual keyboard, screen-reader, resize/reflow, forced-colors, reduced-motion,
  touch, Stripe Checkout, and on-screen packet results.
- Known limitations, owner, workaround, severity, and target remediation date.
- Tester and reviewer names and the test date.

## Content and component requirements

- Use native controls before custom controls; expose accurate name, role, value, and state.
- Provide a descriptive page title, language, one logical `h1`, ordered headings, landmarks, and a skip link.
- Provide text alternatives for meaningful non-text content and hide purely decorative content from assistive technology.
- Meet 4.5:1 text contrast (3:1 for qualifying large text) and 3:1 component/focus contrast.
- Never communicate status or validation by color alone.
- Keep controls at least 24 by 24 CSS pixels or provide sufficient spacing; prefer 44 by 44.
- Do not disable zoom, password managers, paste, or browser accessibility features.
- Caption meaningful prerecorded audio/video and provide a transcript or description when visuals add information.
- Keep an accessible alternative available when a generated/downloaded document cannot retain equivalent semantics.

## Reporting and ownership

The public statement is at `web/accessibility.html`. Accessibility reports go to `support@getmyyes.com`. A reported blocker in upload, review, payment, or document access should be treated as a production defect and receive an accessible workaround while it is fixed.
