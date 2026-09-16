# CLAUDE.md — Andresen Scholarships

Context for AI agents (and humans) working on this repo. Read this first.

## What this is
Website **and** self-hosted scholarship application system for the **Harold A. and Marilyn Kay
Andresen Charitable Trust**. It replaces JotForm starting the **2027 season**. Trustee is
**Pam Slagh** (Dylan Slagh's mother); the board is family members. Two scholarships —
**Ag** and **Memorial**, $1,500 each, ~40 applicants/year.

## Architecture
- Static site (HTML5 UP "Minimaxing" template) + **Cloudflare Pages Functions** backend.
- Backend is **TypeScript** on Cloudflare — a deliberate choice over the old repo's Python
  default, because the platform is JS-native. Don't "convert it back" to Python.
- **D1** (SQLite) stores records, **R2** stores uploaded files, **Resend** sends email.
- One repo; everything deploys together on `git push` to the Cloudflare Pages project.

## Key files
- Public pages: `apply.html` (application form), `recommend.html` (confidential teacher
  recommendation, opened via a tokenized link), `admin.html` (password-gated board dashboard).
  Info pages: `index.html`, `ag-scholarship.html`, `scholarship.html`. Also `404.html`, `favicon.svg`.
- Backend: `functions/api/*` — `apply.ts`, `recommendation/[token].ts`, `admin/*`
  (login, applications, application/[id] incl. PATCH for board review, file/[[key]],
  export = CSV, plus the board-operations routes below);
  `functions/api/admin/_middleware.ts` gates admin routes. Shared code in `functions/lib/*`
  (env, db, storage, auth, email, validation, checks).
- `schema.sql` — D1 tables. `migrations/0002_board_review.sql` adds `score` + `board_notes`
  (**applied to local and remote**). `migrations/0004_operations.sql` adds `email_log`,
  `change_log`, `checks` and `applications.phone_reviewed_at` (**applied to local and remote
2026-09-16**, statement by statement). Gotcha: `db:migrate:remote`
  (`wrangler d1 execute --remote --file=…`) can fail with a Cloudflare **import API** error; running
  each statement as a separate `wrangler d1 execute --remote --command "…"` uses the query API and works.
- `OPERATIONS-HANDOFF-2026-09-16.md` — the brief (from a ChatGPT review session) that the
  board-operations features were built from. Historical; this file describes what was built.
- `wrangler.toml` — Cloudflare config: D1/R2 bindings + production `[vars]`.
- Front-end JS: `assets/js/{apply,admin,recommend,signature-pad,site-config,status-toggle}.js`.
- Styles: `assets/css/site.css` is the whole design system (2026-07 redesign, no jQuery/template
  deps). The Minimaxing-era files (`main.css`/`app.css`, jQuery + template JS, `assets/sass/`,
  `assets/webfonts/`, `images/pic*.jpg`, `LICENSE.txt`) were **deleted** once the redesign no longer
  used them — so the CCA 3.0 attribution no longer applies. The `archive/claudes-improvements` branch
  keeps its own copies. Don't re-add HTML5 UP/Minimaxing credit unless template code comes back.
  **Dashboard on phones (≤760px):** the application table turns into one card per row (pure CSS
  `order` on the table cells, so `renderList()` stays one code path), stats shrink to a compact
  two-column list, a `#sort-mobile` select replaces the header sorting, and the CSV export
  buttons hide. Every dashboard `input`/`select`/`textarea` is **16px** there on purpose:
  iPhone Safari zooms into a focused control under 16px and stays zoomed, which reads as the
  page scrolling sideways. Don't shrink them back.
- **Required fields live in two places and must agree:** the `required` attributes in
  `apply.html` and `REQUIRED_FIELDS` in `functions/lib/validation.ts`. The form is
  `novalidate`, but `apply.js` now runs the native constraint API itself before
  submitting, so a `required` attribute *does* gate the browser — the **server is still
  the real gate**, and both lists must stay in sync. Everything is required except
  Date Accepted and the **parent/guardian signature** (deliberately optional; the
  applicant's signature is required, and `parent_sig_key` is null when it's skipped).
- **There is no Family Financial Information section** — it was removed for 2027.
  The board doesn't weigh financial need (in practice every eligible applicant is
  awarded), so the questions, the D1 columns in `schema.sql`, the admin detail group
  and the CSV columns all went with it, along with the "Financial need of the student"
  and "Family Financial Information" lines on the two scholarship pages. The live
  database **still has the columns** — `migrations/0003_drop_financial_fields.sql`
  drops them but is deliberately unapplied, because dropping a column can't be undone
  and nothing breaks while they sit empty. Don't re-add these questions without asking.
- **Form errors are field-keyed, not one paragraph.** Each control has an `id`, a
  `label[for]`, and its own `.field-error` paragraph wired through `aria-describedby`.
  `apply.js` validates client-side, paints every problem inline, summarises them with
  links in `#form-message`, and focuses the first one. Server rejections carry the same
  shape: `validateApplicationFields` returns `{field, message}[]`, `apply.ts` sends it as
  `errors`, and `badRequest(message, field)` tags single-field failures — so the client
  can highlight the right box. Adding a field means adding its error `<p>` too.
- **Signatures can be drawn *or* typed.** `signature-pad.js` `setTypedName()` renders a
  typed legal name into the same canvas, so `getDataURL()` stays the only source of the
  PNG and nothing downstream (R2 keys, D1 columns, `admin.js`) knows the difference.
  The typed input is the keyboard/screen-reader path — a canvas can't be drawn on with a
  keyboard; pressing Enter on a focused pad jumps to it. Don't "simplify" this away.
- **There is a public contact address.** `CONTACT_EMAIL` (`[vars]` *and* `[env.preview.vars]`)
  is `scholarships@andresen-scholarships.org`: shown in every page footer, on the apply and
  recommend forms, and set as `Reply-To` on every applicant/teacher email via
  `contactEmail(env)`. Inbound mail is delivered by **Cloudflare Email Routing** (root-domain
  MX), which forwards to a real inbox — Resend's MX is on `send.` so the two don't collide.
  See `SETUP.md` §5b. Changing the address means `wrangler.toml` (both blocks), the `mailto:`
  links in the footers, and the routing rule.
  **Inbound is confirmed working end to end (2026-08-11)** — a message sent from an unrelated
  address reached the destination inbox, and Email Routing's analytics recorded it as
  received *and* forwarded. Config, for reference: root MX `route{1,2,3}.mx.cloudflare.net`,
  root SPF `include:_spf.mx.cloudflare.net`, Resend isolated on `send.`, the routing rule
  for `scholarships@` → the trustee's personal Gmail **Active**, catch-all
  (**Drop**) **Disabled** so an unrouted address bounces instead of vanishing.
  **⚠️ Never test this address by mailing it from the inbox it forwards to.** That test cannot
  succeed no matter how healthy forwarding is, and it cost a full debugging round on
  2026-08-11. The rule forwards to that same Gmail account, so the returning copy arrives
  carrying a `Message-ID` Gmail already has in **Sent**, and Gmail suppresses it as a
  duplicate. It is discarded at delivery, leaving nothing in inbox, spam, *or* trash, and
  generating no bounce — indistinguishable from mail vanishing in transit. Test from a work
  address or a phone, and when inbound is in doubt read Email → Email Routing → **Activity
  Log** first: it reports each message as forwarded, dropped, or rejected, and settles in one
  glance what DNS and rule inspection can only circle around.
  **No code is involved either way**; nothing in `functions/` touches inbound mail.
- **One application per student, to one scholarship.** Said on `apply.html`, both scholarship
  pages and `index.html`, and enforced in `apply.ts`: `findApplicationByEmail` rejects a
  repeat **email address** (case-insensitive) with a 409 + `field`, so the browser highlights
  the box, and `emailDuplicateApplication` tells the applicant their first one still stands.
  Scoped to the current season via `seasonStartISO()` (derived from `DEADLINE`, season opens
  the previous July). Checked *before* the R2 uploads so a rejected duplicate leaves no
  orphaned files.
  **A shared phone number is no longer refused (changed 2026-09-16, Dylan approved).** It used
  to be, which meant two seniors in one household couldn't both apply. Now both are accepted
  and the dashboard flags the pair ("Shared phone" badge, a filter, and a warning on the
  detail page) until the board presses *They're different students*, which stamps
  `phone_reviewed_at` on every application in the group. A later third match re-raises the
  flag for all of them; correcting a phone number clears that application's stamp. Phone
  comparison is digits-only on the last 10, grouped by season (`seasonOf()`, July–June).
  A true repeat under a new email is resolved by the board: keep the first, mark the later
  one Not awarded with a note — nothing is deleted.
- **Board operations (built 2026-09-16 from the handoff brief).** Three features on the
  dashboard, all behind the admin middleware:
  - **Email history.** `sendEmail()` records *every* attempt in `email_log` (kind, recipients,
    outcome, Resend message id, error) and never throws — callers read the returned outcome.
    `accepted` means Resend took it, **not** that it arrived; the UI says "Sent" with that
    caveat. `apply.ts` sends the teacher request *first*, so the applicant confirmation and
    board alert can say truthfully whether it went out.
  - **Recommendation follow-up.** `application/[id]/resend-request` re-sends the teacher link.
    Duplicate clicks are stopped by `reserveEmailSend()` — a single `INSERT … WHERE NOT EXISTS`
    that claims a 2-minute window; failed sends don't count, so a retry is never blocked.
    `application/[id]/teacher` corrects name/email and **saves only**; a changed email gets a
    fresh token so the old link dies. Refused once the recommendation is submitted.
    `markRecommendationSubmitted` is conditional on `status = 'pending'`, so a double post
    records once, and only the winner emails the applicant
    (`emailApplicantRecommendationReceived` — teacher's name only, never the text or link).
  - **Corrections.** `application/[id]/details` edits contact/college fields only
    (`EDITABLE_APPLICATION_FIELDS`; academic answers are deliberately not editable). Saves
    only, never emails. Every save goes to `change_log` as before/after JSON; the detail view
    derives "originally submitted as" from the oldest `before`. Changing an email to one
    another application this season uses is refused.
  - **Checks.** `checks` rows, entered by hand; `lib/checks.ts` `summarizeChecks()` is the one
    place the rules live. The *current* check is the one no other check replaces; only it
    counts toward the outstanding amount, so a replacement is never a second award.
    States: needs_check / outstanding / follow_up / cleared. Follow-up covers lost or voided
    with no replacement, a replaced check not yet voided, a replaced check that was cashed
    anyway, two checks cashed, and two unlinked checks. A status is a note — nothing contacts
    a bank. `checks/[id]` PATCH logs to `change_log`; DELETE is for entry mistakes only and is
    refused for a check that something replaces. `export?type=checks` is the reconciliation CSV.
    `checks/[id]/reminder` emails the student a "please cash within two weeks" reminder
    (`emailCheckReminder`) — only for a `handed_out` check that nothing replaces, only when a
    trustee presses the button, with the same 2-minute double-click guard. The "two weeks"
    wording came from Dylan's parents' idea for the paperwork handed out with checks; it's a
    request in the email, not a rule the site enforces.
  The board-facing how-to is the collapsible guide at the top of the list in `admin.html`.
- **Preview shares the production D1 and R2** (`[env.preview.*]` bindings point at the same
  database and bucket). A separate preview database was considered on 2026-09-16 and Dylan
  decided against it: the season is closed, test rows get cleaned up before launch, and there
  are no real applicant emails yet. Name test rows so they're obviously tests, and don't send
  test mail to anyone but Dylan.
- **The open/closed state comes from the server now.** `GET /api/config` reports
  `APPLICATIONS_OPEN` for the environment that serves it, and `SiteConfig.load()` in
  `site-config.js` corrects the page after the static default has painted. That's why
  the preview site can run an open form while production stays closed — *don't* flip
  `applicationsOpen` in `site-config.js` on a branch to test, it would ride a merge into
  production. Keep the static default matching production; change `wrangler.toml`
  (`[vars]` vs `[env.preview.vars]`) to change behaviour.
- **The form autosaves a draft to the browser.** `form-draft.js` writes every answer to
  localStorage (debounced, plus on `pagehide`), restores it on load, and shows the
  `#draft-notice` banner. It is cleared on a successful submit and on "start over", and
  expires after 14 days — a school computer shouldn't keep a student's address forever.
  `clear()` also *stops* autosaving; without that the `pagehide` handler writes the still
  populated form right back and the draft resurrects. **Files can't be restored** (browsers
  don't allow it), which is why the banner tells applicants to re-attach them.
- `SETUP.md` — full first-time setup walkthrough.

## Cloudflare resources (this account)
- Pages project **`scholarship-website`** → live at **andresen-scholarships.org**.
- D1 database **`andresen-scholarships`** (id in `wrangler.toml`).
- R2 bucket **`andresen-scholarship-uploads`**.
- **No DMARC record, deliberately (decided 2026-08-15).** Cloudflare's DNS Recommendations
  panel nags about this; leave it alone. Dylan's call: at ~40 applicants a year nobody is
  going to impersonate the trust, and the parts that actually protect outbound mail are
  already right — Resend's DKIM key is at `resend._domainkey.andresen-scholarships.org`
  (**root** domain, so it aligns exactly with a `scholarships@andresen-scholarships.org`
  From) and `send.` carries `v=spf1 include:amazonses.com ~all`. DMARC at `p=none` would
  add nothing but XML reports. Revisit only if the trust starts sending bulk mail from a
  new service. Don't re-propose it unprompted.
- **`www` redirects to the apex (added 2026-08-15).** It used to be NXDOMAIN — anyone
  typing `www.andresen-scholarships.org` got a browser error, which Cloudflare's own DNS
  Recommendations panel flagged. Two dashboard pieces, neither in this repo: a **proxied
  CNAME `www` → `andresen-scholarships.org`**, plus a Redirect Rule from Cloudflare's
  *"Redirect from WWW to root"* template (`https://www.*` → `https://${1}`, **301**).
  **"Preserve query string" is deliberately checked** — the template ships it off, and
  without it a `recommend.html?token=…` link reached via `www` would lose the token and
  strand the teacher on a broken page. Verified: `www` root and `www` + path + query both
  301 to the apex with the query intact. `_redirects` can't do this — Cloudflare Pages
  explicitly does not support domain-level redirects there, and a root
  `functions/_middleware.ts` would put a Worker in front of every static asset.

## Config model (important)
- `wrangler.toml [vars]` = **production** defaults (committed, non-secret).
- `.dev.vars` = **local** overrides + local-only secrets (gitignored); takes precedence when
  running `npm.cmd run dev`.
- **Secrets** (`ADMIN_PASSWORD`, `SESSION_SECRET`, `RESEND_API_KEY`, `TURNSTILE_SECRET`) and
  `BOARD_EMAILS` live in the **Cloudflare dashboard** (Pages → Settings → Variables and Secrets),
  never committed. They are set per-environment (Production / Preview).
  CLI equivalent: `npx.cmd wrangler pages secret put NAME --project-name scholarship-website`
  (add `--env preview`); it prompts for the value so it stays out of shell history.
- **Gotcha:** because this project has a `wrangler.toml`, its `[vars]` **override** any
  plaintext variable typed into the dashboard. So `BOARD_EMAILS` is deliberately *absent*
  from `[vars]` — an empty entry there would shadow the dashboard secret and silently send
  board notifications to nobody. Keep non-secret config in `wrangler.toml`, secrets in the
  dashboard, and don't duplicate a name across both.
- `DEMO_MODE="true"` — or a missing `RESEND_API_KEY` — makes email **log instead of send**
  (safe). Set `false` + provide the key to send for real. See `functions/lib/env.ts` `isDemoMode`.
- `APPLICATIONS_OPEN` is the **server-side** open/closed gate. Mirror it in
  `assets/js/site-config.js` (`applicationsOpen`) so the "Apply Now" buttons match.

## Dev environment gotchas (Windows)
- Node is at `C:\Program Files\nodejs`. In PowerShell use **`npm.cmd` / `npx.cmd`** — bare `npm`
  hits the script-execution-policy block (`npm.ps1 cannot be loaded`).
- Run locally: `npm.cmd run dev` → http://localhost:8788. Typecheck: `npm.cmd run typecheck`.
- Local admin password is whatever `ADMIN_PASSWORD` is in `.dev.vars`.
- Deploy/D1/R2 commands need Wrangler auth: `npx.cmd wrangler login` (browser approval).

## Deploy
- `git push` → Cloudflare Pages auto-builds. The production branch serves
  andresen-scholarships.org; other branches build preview URLs (`*.pages.dev`).
- Apply the DB schema to the live database once: `npm.cmd run db:init:remote`.

## Status / TODO
- **Done:** full application system; D1 + R2 created; live schema applied; production secrets
  `ADMIN_PASSWORD` + `SESSION_SECRET` set in the dashboard. Resend domain
  `andresen-scholarships.org` verified (DNS records added) and `RESEND_API_KEY` +
  `BOARD_EMAILS` set for **Production** (all three trustees) and **Preview** (Dylan only,
  so branch testing doesn't spam the family).
- **Verified end-to-end on the preview 2026-07-23:** application submit → D1 record + R2
  uploads → all four emails delivered via Resend → teacher recommendation submitted →
  board score/notes saved. The whole season workflow works on real infrastructure.
- **Merged to `main` 2026-07-31 (the launch step).** The redesign *and* the backend are now
  the live site — `andresen-scholarships.org` serves the redesigned pages and `/api/*` hits
  real Pages Functions. Applications ship **closed**: `APPLICATIONS_OPEN="false"` in
  `[vars]` and `applicationsOpen: false` in `site-config.js`, so the Apply buttons read
  "Applications Closed", `apply.html` shows the closed notice instead of the form, and
  `POST /api/apply` returns 403. Flip **both** when the board opens the 2027 season.
- **Turnstile works — verified end to end 2026-08-15.** Real widget in Managed mode; site
  key `0x4AAAAAAELI18EAld-9mftK` is in `apply.html`, and `TURNSTILE_SECRET` is set in the
  dashboard for **both** Production and Preview. The two must stay a matched pair — a token
  minted by one widget fails `siteverify` against a different widget's secret, and the
  applicant just sees "Bot verification failed" with no way past it. Both halves have now
  actually run, where before this was configuration inspection only:
  - **Hostname list — good.** The widget issues a token on `andresen-scholarships.org`
    *and* `preview.andresen-scholarships.org`, and renders on the real `/apply` form (green
    "Success!" above Submit). The old **110200** was `localhost` only, which is simply not
    on the list and doesn't need to be — `verifyTurnstile()` returns `true` when the secret
    is absent, so local dev never needs the widget.
  - **Site key / secret pair — matched.** Preview was opened briefly and `POST /api/apply`
    called twice: a bogus token got `Bot verification failed` (proving the secret is set
    and `siteverify` really runs — this code path had never executed before), and a real
    token from the page's own widget was **accepted**, falling through to field validation.
  **Re-testing is cheap, so do it if the key or secret ever changes.** Turnstile is checked
  in `apply.ts` *before* field validation and before any write, so a POST carrying only
  `cf-turnstile-response` separates the two outcomes — "Bot verification failed" vs. a list
  of required-field errors — while writing nothing to D1 or R2 and sending no email. That's
  why the 2026-08-15 test needed no cleanup and burned no email/phone against the
  one-application rule. Mint a real token by reading `[name="cf-turnstile-response"]` off a
  loaded `/apply` page; it's single-use and expires in ~5 minutes.
  **The season must be open for any of this** — `apply.ts` 403s first. Flip
  `[env.preview.vars] APPLICATIONS_OPEN` and flip it back after. ⚠️ **`preview.andresen-
  scholarships.org` is bound to a branch literally named `preview`** (see `APP_BASE_URL`
  above) — pushing any other branch will not change what that host serves.
- The 2026 applications are **not** migrated — the system starts fresh for 2027.
- **Board operations merged to `main` 2026-09-16** (recommendation follow-up, corrections,
  shared-phone flag, check tracking, cash-the-check reminder, phone layout), after Dylan
  tested it on the preview, including real emails to his Gmail.

### Before the 2027 season opens
Open items Dylan wants settled before applications go public. Check this list whenever the
season-opening work comes up.
- **Confirm the email wording with Pam.** Every email to students and teachers is signed
  "The Andresen Family" (`functions/lib/email.ts`: applicant confirmation, teacher request,
  duplicate notice, recommendation received, cash-the-check reminder). Andresen is Pam's
  maiden name, so no one on the board carries it now, and the sign-off may read strangely —
  or it may be fine. Her call. The public pages' "the Andresen Family of rural Chadwick" is
  history, not a sign-off, and isn't part of this question.
- **Review "please cash or deposit it within the next two weeks"** in the cash-the-check
  reminder (`emailCheckReminder` in `email.ts`; the dashboard guide in `admin.html` repeats
  it). The two-week idea came from Dylan's parents for the check paperwork; confirm the
  wording and the time frame with them, and keep the email and the paperwork saying the same.
- **Test rows to delete.** Two applications with ids `test-preview-0001`
  and `test-preview-0002` (names start "TEST Preview") were added to the shared D1 on 2026-09-16
  to review the board-operations features, along with their `recommendations`, `email_log` and
  any `change_log`/`checks` rows the review creates. Because preview shares production's
  database, they also show on the live dashboard until removed. Delete children first
  (foreign keys): `checks`, `change_log`, `email_log`, `recommendations`, then `applications`,
  each `WHERE application_id LIKE 'test-preview-%'` (`id LIKE …` for `applications`). The one
  other row, Pam's 2026-07-31 application, is hers — leave it for her to decide.

### Planned: send arbitrary email from the board dashboard
Dylan wants to email anyone (applicants, teachers, one-offs) from `admin.html` — both
free-form and from saved templates. **Deliberately not built yet**; the wording and
workflow are a later decision, so don't lock the design down prematurely. What's already
settled if you pick this up:
- `sendEmail()` in `functions/lib/email.ts` already accepts an arbitrary `to` array and a
  `replyTo` — the transport is done, only an admin UI + route is missing.
- Send **one message per recipient**, not one with everyone in `To` — applicants must not
  see each other's addresses.
- `replyTo` is already handled: use `contactEmail(env)` like the other applicant-facing mail.
- Log every send to D1 — **done**: `sendEmail()` writes `email_log` for every message, and the
  detail view's Email History panel reads it. Add a new `EmailKind` and label, nothing more.
- Resend free tier is 100/day, 3,000/month — irrelevant at ~40 applicants, don't design around it.
- Put it behind the existing `functions/api/admin/_middleware.ts` auth like every other admin route.
