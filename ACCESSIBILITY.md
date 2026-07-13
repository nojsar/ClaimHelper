# Accessibility engineering standard

## Scope and target

GetMyYes targets **WCAG 2.2 Level AA** across each full page and the complete customer process: landing page, appeal guides, upload, extraction review, guided questions, preview, authentication, Stripe checkout, confirmation, case management, packet review, and export.

This is an engineering target, not a claim of government certification. The U.S. Department of Justice applies Title III's equal-access and effective-communication duties to public-facing business services on the web, but does not currently prescribe a detailed Title III website standard or issue an “ADA certified” badge. WCAG conformance requires evaluation of full pages and complete processes; automated tools alone cannot establish it.

Primary references:

- DOJ, [Guidance on Web Accessibility and the ADA](https://www.ada.gov/resources/web-guidance/)
- W3C, [Web Content Accessibility Guidelines 2.2](https://www.w3.org/TR/WCAG22/)
- W3C, [Evaluating Web Accessibility](https://www.w3.org/WAI/test-evaluate/)
- W3C, [WCAG-EM conformance evaluation](https://www.w3.org/WAI/test-evaluate/conformance/)

## Release checks

Run these checks after a shared component, template, or critical workflow changes:

```powershell
flutter analyze
flutter test
flutter build web
node tool/marketing_build.mjs
node tool/accessibility_check.mjs web
npx --yes html-validate@10.10.0 "web/**/*.html"
```

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

Record browser, assistive technology, viewport, tested routes, findings, fixes, reviewer, and date. Include users with disabilities in periodic usability reviews when feasible.

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
