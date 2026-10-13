# ContractIQ — Complete Demo Website PRD
## Public Landing Page, Demo Authentication, and Smart Contract Security App

**Product:** ContractIQ  
**Tagline:** Intelligent Smart Contract Security  
**Document type:** Product Requirements Document + Implementation Specification  
**Implementation phase:** Frontend-only demo; Supabase integration is explicitly deferred  
**Primary implementation agent:** Codex  
**Status:** Build against the existing repository; preserve working features and improve incrementally

---

## 1. Product objective

Turn the existing ContractIQ application into a complete, polished website with two connected experiences:

1. **Public marketing website:** a compelling landing page explaining ContractIQ, its value, how it works, and how visitors can enter the demo.
2. **Demo application:** the already-developed smart-contract security dashboard and workflows, accessible after a simulated login or through a clearly labelled demo-entry option.

The result should feel like a coherent, production-quality product, while remaining honest that the current implementation uses mock data and does not perform real security analysis.

“Fully working” means all in-scope navigation, forms, filters, demo sign-in/sign-out, routes, charts, dialogs, settings, and report-print flows behave correctly in the browser. It does **not** mean production authentication, secure user accounts, a real scanner, a backend, or persistent cloud data.

## 2. Non-negotiable principles

- Inspect the existing codebase before changing it. Reuse the current stack, components, styles, data models, and working flows where practical.
- Do not rebuild the application from scratch or replace functioning screens merely to match a new structure.
- Public pages must not require sign-in. App pages must pass through the demo-auth gate.
- No Supabase client, credentials, database, storage, or real authentication is to be added in this phase.
- Demo authentication is a UI/navigation simulation only. Never describe it as secure authentication.
- All security findings and scan records are deterministic mock data.
- Never claim a real contract was scanned, that an exploit was executed, or that a contract is safe.
- No dead buttons, inert links, fake loading progress, or controls that pretend to perform a backend action.
- 3D is progressive enhancement. Every essential task must remain usable with WebGL unavailable.
- Correctness, clarity, accessibility, and usability take priority over visual effects.
- Do not claim tests, browser checks, performance metrics, or acceptance criteria passed unless evidence was collected.

## 3. Audience and core journeys

### Primary users
- Smart-contract developers exploring potential vulnerability categories.
- Hackathon judges evaluating the product experience.
- Visitors who want to understand the product before entering the demo.

### Main journeys
1. Visitor opens `/` → understands the product → selects **Explore Demo** → reaches the demo login/entry screen → enters the application.
2. Visitor selects **Sign in** → sees a polished demo sign-in form → submits valid demo-form values → enters the app with a visible demo-mode indicator.
3. User navigates dashboard → starts a demo scan → views scan details → inspects a finding and source excerpt → opens report/print view.
4. User signs out → returns to the public landing page.
5. User refreshes a protected app route → demo session behavior is consistent with the chosen demo persistence approach.
6. User visits an unknown route → sees a useful Not Found page with a path back to the landing page or app.

---

## 4. Information architecture and routes

Use React Router or the repository’s existing routing solution. Resolve route conflicts deliberately.

### Public routes
- `/` — marketing landing page
- `/login` — demo sign-in
- `/signup` — demo registration-style screen, if included; must clearly say account creation is simulated
- `/privacy` — short demo privacy/data notice
- `/terms` — demo terms/limitations page
- `*` — Not Found page, with public and app navigation appropriate to session state

### App routes
Keep the existing product pages, but place the dashboard under an unambiguous app path:
- `/app` — redirect to `/app/dashboard`
- `/app/dashboard` — current dashboard
- `/app/new-scan`
- `/app/scans`
- `/app/scans/:scanId`
- `/app/scans/:scanId/findings/:findingId`
- `/app/reports/:scanId`
- `/app/settings`

Compatibility:
- If existing links or tests rely on `/new-scan`, `/scans`, `/scans/:scanId`, `/reports/:scanId`, or `/settings`, either update every internal reference consistently or provide redirects to the corresponding `/app/...` route.
- Do not leave duplicate route implementations that drift apart.
- The root route `/` must be the landing page, not the signed-in dashboard.
- Unknown scan/finding IDs must show a useful not-found state rather than crash or render unrelated mock data.

### Route access rules
- Public routes are accessible without demo sign-in.
- App routes pass through a single `DemoAuthGuard`.
- Unauthenticated access to an app route redirects to `/login?next=<safe-relative-path>`.
- After successful demo entry, navigate to the requested safe app path or `/app/dashboard`.
- Prevent open redirects: `next` must be a local relative path beginning with `/app/`; otherwise use `/app/dashboard`.
- Signing out clears the simulated session and returns to `/`.
- The UI must label the session and app as **Demo mode**.

---

## 5. Landing page requirements

### 5.1 Design direction

Create a premium, developer-focused security product landing page. It should feel credible and technical rather than like a generic AI/crypto template.

- Strong typography, generous spacing, restrained color accents, clear content hierarchy.
- Use the current ContractIQ design tokens where practical so the landing page and application feel like one product.
- Use a dark hero if it fits the existing brand, but keep text contrast high and use light surfaces for sections where that improves readability.
- Avoid rotating coins, decorative blockchain globes, fake terminal output, fake attack maps, excessive neon, and meaningless particle effects.
- Use subtle motion only; respect `prefers-reduced-motion`.
- Make the page responsive from mobile through wide desktop.
- Do not introduce a 3D hero solely for decoration. If an existing scene is reused, it must be clearly illustrative/demo data and must not delay the first meaningful paint. A static 2D visual is preferred for the public landing page unless measured performance remains acceptable.

### 5.2 Header/navigation

Include:
- ContractIQ wordmark/logo and tagline.
- Navigation anchors: Product, How it works, Capabilities, FAQ.
- **Sign in** link to `/login`.
- Primary **Explore Demo** CTA to `/login?mode=demo` or the agreed demo-entry flow.
- Mobile navigation menu with working open/close behavior, keyboard access, focus management, and Escape handling.

Header behavior:
- Sticky or fixed only if it does not obscure content.
- Active section styling may be added when reliable.
- All links must point to real sections/routes.
- No placeholder `href="#"` links.

### 5.3 Hero section

Suggested content (copy may be refined, but do not change the meaning):

Eyebrow: **SMART CONTRACT SECURITY WORKSPACE**

Headline: **See the risks in your smart contracts before deployment.**

Supporting text: **Explore a developer-focused workspace for reviewing vulnerability findings, understanding affected code, and examining remediation guidance.**

Primary CTA: **Explore Demo**  
Secondary CTA: **See How It Works**

Demo disclaimer close to the CTA or hero visual:
**Interactive demo — uses illustrative mock data. No real contract analysis is performed.**

Visual:
- A high-quality product preview based on actual existing dashboard UI, a static screenshot-like composition, or a simplified illustrative finding panel.
- Do not fabricate live scan states, real security scores, real customer logos, customer counts, audit certifications, or testimonials.
- If mock metrics are shown, label them as sample/demo data.
- CTA must be visible without scrolling on common desktop sizes and remain easy to find on mobile.

### 5.4 Trust and honesty strip

Use factual product capabilities, not invented social proof. Examples:
- Findings organized by severity
- Source-level context
- Remediation guidance
- Demo data, clearly identified

Do not claim audited, certified, battle-tested, trusted by named customers, or powered by real scanning unless later supported by evidence.

### 5.5 Product overview

Show three or four feature cards, for example:
1. **Understand findings** — inspect severity, category, evidence, and potential impact in a structured view.
2. **Trace source context** — connect illustrative findings to relevant source excerpts.
3. **Explore relationships** — inspect demo contract/function relationships through an optional graph view.
4. **Review remediation** — view suggested fixes and illustrative before/after examples.

Each card should use a consistent icon system, readable text, and restrained hover states. Icons must be decorative when adjacent text already conveys their meaning.

### 5.6 How it works

A concise three-step section:
1. Add or choose a demo contract.
2. Explore illustrative findings and affected source.
3. Review remediation guidance and print a demo report.

Make clear this workflow is simulated in the current frontend demo; it is not a real scanner.

### 5.7 Product preview section

- Show a real screenshot or a composed preview based on the current app.
- Prefer screenshots captured from the running app over invented UI mockups.
- If a screenshot is not available, build a faithful preview using reusable components and the same design tokens.
- Do not make a non-interactive screenshot look like a functioning control.
- Include a nearby CTA to explore the demo.

### 5.8 Capabilities / use cases

Describe what the demo lets visitors explore:
- Severity-based finding triage
- Finding details and source excerpts
- Illustrative contract relationship graph
- Scan history and report preview
- Display preferences and accessible 2D fallbacks

Use precise language: “explore,” “review,” “illustrative,” and “demo.” Avoid guarantees of detection accuracy or prevention.

### 5.9 FAQ

Include questions such as:
- Does ContractIQ run a real smart-contract scan? **Not in this demo.**
- Is sign-in connected to a real account? **No. Demo sign-in is simulated; Supabase is planned for a later phase.**
- Is demo data persistent? Explain the actual implemented behavior accurately.
- Can I print a report? Yes, the demo report uses browser print/PDF and is clearly marked as demo output.
- Does the experience work without 3D? Yes; essential content and workflows must remain available in 2D.

FAQ accordions must be keyboard accessible and expose expanded state to assistive technology.

### 5.10 Final CTA and footer

Final CTA: **Explore the ContractIQ demo** → `/login?mode=demo`.

Footer:
- Product name/tagline
- Product/How it works anchors
- Sign in
- Privacy and Terms pages
- Explicit demo limitation note
- Current year generated dynamically at runtime

Do not invent social profiles, support email addresses, company addresses, or legal entity details.

---

## 6. Demo login and registration-style UI

### 6.1 Sign-in page

Create a polished, responsive page consistent with the landing page and app design system.

Required elements:
- ContractIQ logo linking to `/`
- Heading such as **Welcome to ContractIQ**
- Short explanation that this is a frontend demo
- Email input
- Password input with show/hide control
- Remember-demo-session checkbox, if session persistence is implemented
- Submit button labeled **Enter Demo** or clearly marked demo sign-in
- Secondary **Continue as Demo** button for frictionless access
- Link back to landing page
- Inline validation, disabled/loading state while submitting, and accessible error messages

Behavior:
- Validate email format and required fields with React Hook Form + Zod if already in the stack.
- Since there is no auth backend, do not send credentials anywhere or log/store the password.
- For the form-based demo path, accept any syntactically valid email and a non-empty password, or use another deterministic rule clearly explained in the UI. Never imply these credentials were verified by a server.
- Do not store the password in localStorage, sessionStorage, logs, URL parameters, or mock records.
- On successful simulated entry, create a demo session marker only.
- If a user enters invalid data, show useful inline validation.
- The `Continue as Demo` button should create the same demo session without collecting credentials.
- Clearly state: **Demo sign-in only — no account is created and no credentials are sent to a server.**

### 6.2 Signup page

Optional but recommended only if the landing page includes a signup link:
- Clearly labeled **Create a demo profile** or **Registration preview**.
- Form validation and password confirmation can be shown, but no real account is created.
- Do not store passwords.
- After submission, show an explicit confirmation that account creation is simulated and provide a button to enter the demo.
- Do not imply email verification or password recovery is available.
- If this creates unnecessary confusion, omit `/signup` and keep a single demo-entry flow.

### 6.3 Password recovery

Do not implement a fake password reset flow. If a “Forgot password?” link is present, it must open an explanation that password recovery is unavailable in demo mode, not pretend to send an email. Prefer omitting this link for the current phase.

---

## 7. Demo session architecture

Implement a small replaceable auth abstraction, e.g.:
- `DemoAuthProvider`
- `useDemoAuth()`
- `DemoAuthGuard`
- `signInDemo()`
- `signOutDemo()`

Keep it isolated so Supabase can replace the provider later without rewriting page components.

### Session requirements
- Use a single documented storage choice. Prefer `sessionStorage` for a tab-scoped demo session unless the existing PRD requires a different persistence behavior.
- Store only a non-sensitive demo session flag and minimal demo display identity, never passwords or tokens.
- If “Remember this demo session” is implemented, document what it changes; otherwise omit it.
- Handle storage unavailable/private browsing gracefully with in-memory session state.
- Refresh behavior must be predictable and tested.
- Sign-out must clear the demo session.
- The topbar/avatar must show **Demo User** or another explicitly simulated identity.
- Never call this production authentication, authorization, or account security.

### Supabase-ready boundary
- Do not install or configure Supabase now.
- Do not add environment variables that imply a configured Supabase project.
- Keep UI components independent of the demo provider.
- Add a short README note identifying the future replacement boundary for Supabase authentication.
- Do not design the mock auth layer in a way that requires app pages to know whether the eventual provider is Supabase.

---

## 8. Existing application requirements to preserve

The existing ContractIQ app is the authenticated/demo workspace. Keep its existing functionality and visual quality. Do not remove a page just to make room for the landing page.

### Dashboard — `/app/dashboard`
- Stat cards and recent scan activity use the same deterministic mock data source.
- Vulnerability Distribution must have a polished, readable layout. If the current redesign uses a white background, preserve it: white surface, dark text, subtle borders, proportional bars, exact counts, and percentages derived from source data.
- Severity categories: Critical, High, Medium, Low, Informational, with accessible and consistent colors.
- Any severity selection/filter must remain synchronized with the findings list.
- Empty/zero data states must be meaningful.
- Demo disclaimers remain visible.

### New Scan — `/app/new-scan`
- Keep paste/upload/editor workflow and form validation from the existing PRD.
- If file upload is supported in the demo, process only local file content in the browser and explain the limitation; do not upload it to a server.
- Validate supported file types/size if file selection exists.
- Create a deterministic mock scan record from the service layer.
- Label the action as a demo. Do not show fake analysis progress or imply real scanning.
- Invalid form submissions show actionable errors.

### Scan Details — `/app/scans/:scanId`
- Show scan metadata, findings, severity filters, source excerpts, and verification disclaimer.
- Keep the existing desktop Risk Surface scene where supported and its content-parity 2D fallback.
- Stage/list selection must stay synchronized.
- For non-completed mock statuses, show a neutral status placeholder instead of a misleading empty 3D stage.
- Preserve the explicit wording **DEMO DATA — NO EXPLOIT EXECUTED** where required by the existing PRD.

### Finding Details — `/app/scans/:scanId/findings/:findingId`
- Show severity, category, description, impact, evidence, source excerpt, and remediation guidance using mock data.
- Keep the contract graph caption **Illustrative call structure — demo data.**
- Selecting a graph node should reveal the corresponding source section and bring it into view accessibly.
- Related finding navigation must resolve to a valid route.
- Never imply that exploit execution or live verification occurred.

### Scan History — `/app/scans`
- Search, filter, sort, pagination (if present), row selection, and delete confirmation must work.
- Timeline toggle may remain if implemented and reliable.
- Table and timeline use the same data source.
- Empty and no-match states must be distinct.

### Report — `/app/reports/:scanId`
- All report content is derived from the same mock services as dashboard/history.
- Print/PDF uses browser print.
- Hide canvases and 3D stages in print.
- Ensure printed output is readable and labeled as demo output.
- Do not claim a file was exported unless a real download is implemented.

### Settings — `/app/settings`
- Theme and appearance settings work live.
- Visual fidelity: Enhanced / Standard / Minimal, with Minimal using 2D fallbacks everywhere.
- Motion: Full / Reduced; honor the user’s explicit setting and document precedence relative to OS preference.
- Turning Enhanced visuals off must disable all enhanced effects, including hover dolly and topbar blur.
- Persist only non-sensitive preferences.
- Ensure settings behave sensibly if storage is unavailable.

### Not Found
- Show a clear message and working links to the landing page and, when demo session exists, dashboard.
- Do not show an unnecessary 3D stage on low-power devices or with reduced motion.

---

## 9. 3D architecture and performance: keep what is useful, defer what is not

The existing PRD describes these scenes:
- `SeverityOrbitScene` — dashboard severity distribution
- `RiskSurfaceScene` — scan details
- `ContractGraphScene` — finding details and related findings
- `ScanTimelineScene` — optional scan history timeline
- `StageShell` — loading, fallback, reduced motion, error, and fullscreen behavior

Preserve working scenes and fallback behavior, but do not treat every optional 3D detail as a blocker for the landing page or core demo workflows.

### Required functional behavior
- Every 3D stage has an equivalent usable 2D representation.
- WebGL unavailable/context lost/scene error → graceful 2D fallback.
- Minimal fidelity → 2D fallback everywhere.
- Reduced motion → static/reduced-motion experience.
- Mobile uses 2D equivalents as required by the responsive PRD.
- Low-power detection may be added if it can be implemented reliably; avoid brittle browser heuristics that misclassify devices. If no reliable signal exists, use conservative fallbacks and document the limitation.
- No idle scene auto-rotation.
- Hover dolly, shadows, postprocessing, and topbar blur obey fidelity/motion settings.
- Keyboard and screen-reader alternatives mirror scene data and selection.
- Stage selection and corresponding lists/source sections/routes remain synchronized.
- Dispose GPU resources on unmount and avoid unnecessary render-loop work.
- Lazy-load scenes and ensure the initial landing-page bundle does not include 3D dependencies.

### Performance handling
The prior audit reported LCP spot measurements of 2.536–3.076 seconds under a throttled profile, a scene-related chunk of roughly 911.72 KB minified / 241.87 KB gzip, and missing INP/GPU-memory/frame-budget evidence.

These are known gaps, not automatically release blockers for the demo if the user experience remains stable. However:
- Optimize the public landing page and initial app entry first.
- Split scene imports where safe and avoid loading 3D libraries on public routes.
- Measure with repeatable tooling where available; record environment, sample count, and variability.
- Do not claim p75 LCP/INP without enough real samples.
- Do not claim exact GPU memory from renderer resource counts alone.
- Do not invent metrics. Mark unmeasured targets as unverified.
- Prioritize functional fallbacks and no-crash behavior over achieving an arbitrary bundle number at the cost of quality.
- Defer non-essential architecture-only differences (such as folder naming or optional dependencies) unless they cause a real defect or block maintainability. Do not add a dependency merely to match a checklist if the current implementation works without it.

---

## 10. Data and services

Keep a single deterministic mock data/service layer, with existing types where possible:
- `scanService`
- `findingService`
- `reportService`
- any existing settings/mock auth service

Requirements:
- Dashboard, scan history, scan details, finding details, and reports derive from the same records.
- Totals, severity counts, statuses, and report numbers must agree across routes.
- Mock IDs and seeded graph layouts are stable across reloads.
- Unknown IDs return explicit not-found results.
- Mutations such as creating/deleting a demo scan have predictable local behavior.
- Avoid duplicating hardcoded counts in UI components.
- Keep mock data and service functions separate from presentation components.
- Define a clear future backend adapter boundary, but do not build backend calls.

### Contract graph type contract
If implementing or changing the graph data, align to this contract unless the existing code has a justified compatible equivalent:
```ts
interface ContractNode {
  id: string;
  label: string;
  kind: 'function' | 'modifier' | 'state' | 'external';
  line?: number;
}

interface RelationEdge {
  from: string;
  to: string;
  kind: 'calls' | 'reads' | 'writes' | 'guards';
  findingIds?: string[];
}
```
Layouts must be deterministic/precomputed; do not run force simulation during render.

---

## 11. Accessibility and responsive requirements

Target WCAG 2.2 AA for the user-facing flows.

- Semantic landmarks, one clear H1 per page, correct heading hierarchy.
- Keyboard-accessible nav, menus, accordions, dialogs, form controls, charts, and scene mirrors.
- Visible focus indicators and correct focus management.
- Form errors associated with inputs and announced accessibly.
- Text contrast checked on both the landing page and white Vulnerability Distribution card.
- No information conveyed by color alone.
- Respect `prefers-reduced-motion` and in-app motion settings.
- No essential content available only in canvas/3D.
- No horizontal overflow at mobile widths.
- Test at representative widths: 375px, 768px, 1024px, and 1440px.
- Touch targets and mobile navigation must be usable.
- Ensure browser zoom and text scaling do not break layouts.

### Required responsive behavior
- Mobile: landing page stacks naturally; navigation collapses; CTA remains visible and usable.
- Tablet: feature cards and dashboard layouts reflow without cramped columns.
- Desktop: full navigation and app sidebar appear where appropriate.
- 3D stages follow the existing PRD's breakpoints and always retain 2D fallback parity.

---

## 12. Security, privacy, and demo disclosures

- No credentials leave the browser.
- Passwords are never persisted.
- Do not place secrets in source code or `.env` files.
- Do not collect analytics or send data to a third party in this phase.
- Do not imply uploaded source is sent to a server if processing is local.
- Add a clear demo/privacy notice describing local demo behavior and storage used.
- Avoid logging source code or credentials to the console.
- The app must not display “secure,” “verified safe,” or “no vulnerabilities” as a guarantee.
- Findings are examples, not audit advice or proof of security.
- Clearly label reports and mock scan results as demo data.

---

## 13. Error, loading, and empty states

Every relevant page must handle:
- Initial loading
- Empty dataset
- Search/filter no results
- Invalid form input
- Unknown scan/finding ID
- Local file read failure or unsupported file
- Storage unavailable
- Simulated auth session missing
- WebGL unavailable/context lost
- Scene import/render failure
- Print/report route failure

Each state must explain what happened and provide a useful next action. Avoid endless spinners, silent failures, raw stack traces, or empty white/black stage rectangles.

---

## 14. Testing and acceptance criteria

Do not mark the project complete until the following checks have been attempted and the results are reported honestly.

### Landing page
- [ ] `/` displays the public landing page when signed out.
- [ ] Header links and section anchors work.
- [ ] Primary and secondary CTAs navigate correctly.
- [ ] Mobile navigation opens/closes, traps no unintended focus, and supports Escape.
- [ ] FAQ controls work with keyboard and expose expanded state.
- [ ] No invented customers, testimonials, certifications, or unsupported product claims.
- [ ] Landing page does not eagerly load the 3D scene bundle.

### Demo auth
- [ ] `/login` loads without an existing session.
- [ ] Invalid form values produce accessible validation.
- [ ] Valid demo entry creates only a demo session; password is not persisted or sent.
- [ ] Continue as Demo works.
- [ ] Protected routes redirect to login when signed out.
- [ ] A safe `next` path returns the user to the requested app route.
- [ ] Invalid/external `next` values cannot redirect off-site.
- [ ] Sign-out clears the session and returns to the landing page.
- [ ] Refresh behavior matches the documented storage choice.
- [ ] UI consistently identifies the app as demo mode.

### Core app
- [ ] Every required route loads directly and on refresh.
- [ ] Dashboard totals and severity counts match the service data.
- [ ] New Scan validates and creates a deterministic demo record.
- [ ] Search/filter/sort and relevant selection interactions work.
- [ ] Unknown IDs show a not-found state.
- [ ] Finding/source selection is synchronized and source sections are brought into view.
- [ ] Report data matches the underlying scan and print output hides 3D.
- [ ] Settings apply live and persist safely where expected.
- [ ] No dead controls or broken internal links.

### 3D and fallback
- [ ] WebGL unavailable → 2D fallback.
- [ ] Context loss → graceful fallback.
- [ ] Minimal fidelity → 2D fallback everywhere.
- [ ] Reduced motion is respected.
- [ ] Enhanced effects are gated correctly.
- [ ] Stage selection is synchronized with lists, routes, and source excerpts.
- [ ] Screen-reader text alternatives convey all essential scene data.
- [ ] No uncaught scene errors or persistent blank stages.
- [ ] 3D dependencies are not loaded on the public landing page.

### Quality gates
- [ ] `npm run test`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm run check:consistency` (if present)
- [ ] Browser checks at 375px, 768px, 1024px, and 1440px.
- [ ] Screenshot evidence for the landing page and key app routes at desktop/mobile widths.
- [ ] Keyboard-only pass for landing page, login, dashboard, and one finding flow.
- [ ] Screen-reader check for forms and at least one 3D scene's HTML mirror.
- [ ] Console checked for errors.
- [ ] Performance results documented with methodology; unmeasured metrics explicitly marked unverified.

If a command does not exist, report that it is unavailable rather than silently skipping it. If browser automation is broken, provide manual test steps and do not claim browser acceptance passed.

---

## 15. Implementation plan for Codex

Implement in small, verifiable phases. Inspect the repository first and produce a short route/component map before editing.

### Phase A — Audit and safe baseline
1. Inspect package scripts, router, existing components, mock services, styles, and current tests.
2. Identify the current dashboard route and all links that depend on it.
3. Run existing tests/lint/build before changes if possible.
4. Record existing known failures and bundle measurements.
5. Do not delete or rewrite working code.

### Phase B — Route and demo-auth foundation
1. Add the demo auth provider and guard.
2. Move the dashboard to `/app/dashboard` and map existing app routes under `/app/...`.
3. Add redirects for old routes if needed.
4. Verify direct navigation, refresh, protected routes, `next`, and sign-out.

### Phase C — Public landing page
1. Build the responsive header, hero, product overview, how-it-works, capabilities, FAQ, final CTA, and footer.
2. Reuse the existing design system and real app UI where possible.
3. Add privacy/terms demo notices.
4. Ensure no 3D dependencies load on the landing page.
5. Verify all links, responsive states, and accessibility.

### Phase D — Login/demo entry
1. Implement validation and the simulated demo-entry flow.
2. Ensure credentials are never stored or sent.
3. Add Continue as Demo.
4. Test protected-route redirects and sign-out.

### Phase E — Existing app integration and repair
1. Verify all current pages still work under `/app`.
2. Fix confirmed functional defects, including data mismatches, dead controls, invalid routes, and source-selection parity.
3. Keep the white Vulnerability Distribution redesign if already implemented and working.
4. Do not add new 3D scenes during this phase unless a required existing scene is missing and the user explicitly approves that scope.

### Phase F — 3D fallback, fidelity, and performance audit
1. Test WebGL fallback, context loss, Minimal, reduced motion, and scene errors.
2. Gate all enhanced effects consistently.
3. Split bundles only where safe and measure before/after.
4. Do not block core functionality on unmeasurable GPU budgets; report the evidence limitation clearly.

### Phase G — Verification and delivery
1. Run all available quality commands.
2. Test routes and interactions in a real browser if available.
3. Capture desktop/mobile screenshots.
4. Report completed work, files changed, test output, browser evidence, remaining gaps, and manual steps.
5. Do not claim 100% complete if any acceptance gate remains unverified.

---

## 16. Definition of done

The demo is ready when:
- The public landing page is polished, responsive, and honest about demo limitations.
- The login/demo-entry experience works without Supabase.
- Protected app routes and sign-out behave predictably.
- The existing ContractIQ workspace remains intact and all in-scope interactions work.
- Mock data is consistent across the dashboard, scans, findings, and reports.
- The Vulnerability Distribution chart is readable, accurate to the mock data, and responsive.
- 3D scenes are optional enhancements with reliable 2D alternatives.
- Accessibility, route behavior, error states, and responsive layouts have been checked.
- Automated test/lint/build results are reported accurately.
- Browser/performance/screen-reader checks are either evidenced or explicitly marked outstanding.
- README explains demo mode, session storage behavior, current limitations, and the future Supabase replacement boundary.

**Final instruction to Codex:** Implement the website in phases in the existing repository. Start with repository inspection and a concise plan, then complete Phase A and Phase B before proceeding. Do not stop at a plan; implement, test, and report each phase. Preserve working functionality and wait for user approval between substantial phases. Never fabricate verification evidence.
