# Andresen Scholarships — Application System Setup

This site now includes a self-hosted scholarship application system (replacing JotForm),
built on **Cloudflare Pages Functions + D1 + R2**, with email through **Resend**.

- **Applicants** apply at `/apply.html`.
- **Teachers** get a private link (`/recommend.html?token=…`) to submit a confidential recommendation.
- **The board** reviews everything at `/admin.html` (password-protected).

Everything lives in this one repo and deploys together when you push to Cloudflare Pages.

---

## What you need

- A Cloudflare account (you already have the site under **Workers & Pages**).
- A [Resend](https://resend.com) account (free tier is plenty) for sending email.
- [Node.js](https://nodejs.org) 18+ installed locally (for running/testing before you deploy).

---

## 1. Install dependencies

```bash
npm install
```

## 2. Create the database and file storage (one time)

```bash
# D1 database — copy the printed database_id into wrangler.toml (database_id = "…")
npx wrangler d1 create andresen-scholarships

# R2 bucket for uploaded files
npx wrangler r2 bucket create andresen-scholarship-uploads
```

Then create the tables:

```bash
npm run db:init:remote   # production database
npm run db:init:local    # local copy for testing
```

## 3. Local secrets

Copy the example file and fill it in (this file is gitignored — never commit real secrets):

```bash
cp .dev.vars.example .dev.vars
```

- `ADMIN_PASSWORD` — the password the board uses at `/admin.html`.
- `SESSION_SECRET` — any long random string.
- `RESEND_API_KEY` — leave blank for now; email will just log to the console.
- `TURNSTILE_SECRET` — leave blank locally.

## 4. Run it locally

```bash
npm run dev
```

Open <http://localhost:8788/apply.html>, submit a test application, then log into
<http://localhost:8788/admin.html> with your `ADMIN_PASSWORD`. While `DEMO_MODE="true"`
(in `wrangler.toml`), emails are printed to the terminal instead of being sent — so you
can demo the whole flow safely with no email account.

---

## 5. Turn on real email (Resend)

1. In Resend, add and **verify your domain** (the site's Cloudflare domain). Resend gives
   you DNS records — because your DNS is on Cloudflare, you add them in the same dashboard.
2. Create an API key.
3. Set `RESEND_FROM` in `wrangler.toml` to a verified address, e.g.
   `Andresen Scholarships <scholarships@yourdomain.org>`.
4. Set `DEMO_MODE="false"` in `wrangler.toml`.
5. Add `RESEND_API_KEY` as a **Secret** in the Pages dashboard (see step 7).

## 6. Bot protection (Turnstile)

1. In Cloudflare → Turnstile, create a widget for your domain.
2. Put the **site key** into `apply.html` (replace the test key `1x00000000000000000000AA`
   in the `data-sitekey` attribute).
3. Add the **secret key** as the `TURNSTILE_SECRET` secret (step 7).
   Until you do this, bot verification is skipped.

## 7. Deploy

Your repo is already connected to Cloudflare Pages, so **push the branch**:

```bash
git push origin scholarship-app
```

Cloudflare builds a **preview URL** for the branch — share it with the board to review
before going live. Merge to `main` when approved.

In the Pages project **Settings → Functions**, bind:
- **D1 database** → variable name `DB` → `andresen-scholarships`
- **R2 bucket** → variable name `UPLOADS` → `andresen-scholarship-uploads`

The **plaintext** settings (`APP_BASE_URL`, `RESEND_FROM`, `DEADLINE`,
`APPLICATIONS_OPEN`, `DEMO_MODE`) live in `wrangler.toml` under `[vars]` — edit them
there and push. Because this project has a `wrangler.toml`, plaintext variables typed
into the dashboard are **ignored**, so don't set them in both places.

Everything below is a **secret**. Set each one in **Settings → Variables and Secrets**
(mark *Encrypt*), separately for **Production** and **Preview**:

| Name | Value |
|------|-------|
| `BOARD_EMAILS` | comma-separated trustee emails (a secret so the addresses stay out of the repo) |
| `RESEND_API_KEY` | from Resend |
| `ADMIN_PASSWORD` | board password |
| `SESSION_SECRET` | long random string |
| `TURNSTILE_SECRET` | from Turnstile |

Or from the terminal, which prompts for the value instead of putting it in your shell history:

```
npx.cmd wrangler pages secret put RESEND_API_KEY --project-name scholarship-website
```

Add `--env preview` to set the Preview copy. Note the Pages **project** is named
`scholarship-website`, which is not the same as the `name` field in `wrangler.toml`.

---

## Opening and closing applications

- **Server-side gate:** `APPLICATIONS_OPEN` (`wrangler.toml` locally / dashboard in prod).
  When `false`, submissions are rejected even if someone reaches the form.
- **Site buttons:** `assets/js/site-config.js` (`applicationsOpen`, `deadline`) controls
  what the "Apply Now" buttons and notices show. Keep the two in sync each season.

## Where things live

- `apply.html`, `recommend.html`, `admin.html` — the three pages.
- `functions/api/*` — the backend (submit, recommendation, admin).
- `functions/lib/*` — shared helpers (db, storage, email, auth, validation).
- `schema.sql` — database tables.
- Uploaded files → R2 under `applications/{id}/…`; records → D1.

## Optional hardening

Instead of the password gate, you can protect `/admin.html` and `/api/admin/*` with
**Cloudflare Access** (Zero Trust → allow only the board's emails). That gives each
trustee their own login with no shared password.
