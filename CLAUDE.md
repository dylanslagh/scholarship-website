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
  (login, applications, application/[id] incl. PATCH for board review, file/[[key]], export = CSV);
  `functions/api/admin/_middleware.ts` gates admin routes. Shared code in `functions/lib/*`
  (env, db, storage, auth, email, validation).
- `schema.sql` — D1 tables (`applications`, `recommendations`). `migrations/0002_board_review.sql`
  adds `score` + `board_notes` to an existing DB (`npm run db:migrate:local` / `:remote` — the
  remote migration still needs to be run before the redesign branch goes live).
- `wrangler.toml` — Cloudflare config: D1/R2 bindings + production `[vars]`.
- Front-end JS: `assets/js/{apply,admin,recommend,signature-pad,site-config,status-toggle}.js`.
- Styles: `assets/css/site.css` is the whole design system (2026-07 redesign, no jQuery/template
  deps). `assets/css/{main,app}.css` + `assets/js/{jquery.min,util,main,breakpoints.min,browser.min}.js`
  are the retired Minimaxing-era files — unreferenced by the redesigned pages, kept for old branches.
- `SETUP.md` — full first-time setup walkthrough.

## Cloudflare resources (this account)
- Pages project **`scholarship-website`** → live at **andresen-scholarships.org**.
- D1 database **`andresen-scholarships`** (id in `wrangler.toml`).
- R2 bucket **`andresen-scholarship-uploads`**.

## Config model (important)
- `wrangler.toml [vars]` = **production** defaults (committed, non-secret).
- `.dev.vars` = **local** overrides + local-only secrets (gitignored); takes precedence when
  running `npm.cmd run dev`.
- **Secrets** (`ADMIN_PASSWORD`, `SESSION_SECRET`, `RESEND_API_KEY`, `TURNSTILE_SECRET`) and
  `BOARD_EMAILS` live in the **Cloudflare dashboard** (Pages → Settings → Variables and Secrets),
  never committed. They are set per-environment (Production / Preview).
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
  `ADMIN_PASSWORD` + `SESSION_SECRET` set in the dashboard.
- **Stage 2 (before opening to real students):** add `RESEND_API_KEY`, `BOARD_EMAILS`, and
  Turnstile (real site key in `apply.html`, `TURNSTILE_SECRET` in the dashboard); consider
  `APPLICATIONS_OPEN="false"` until the 2027 season actually opens.
- The 2026 applications are **not** migrated — the system starts fresh for 2027.
