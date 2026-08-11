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

## 5b. Receiving mail at the contact address (Cloudflare Email Routing)

Resend only *sends*. The contact address printed on every page and set as `Reply-To`
on every email — `CONTACT_EMAIL` in `wrangler.toml`, currently
`scholarships@andresen-scholarships.org` — needs somewhere to land, or replies vanish.
Cloudflare Email Routing forwards it to a real inbox, free:

1. Cloudflare dashboard → the **andresen-scholarships.org** zone → **Email** → **Email Routing**
   → **Get started**. Accept the DNS records it offers (three MX + an SPF TXT record).
2. Under **Destination addresses**, add the inbox that should receive the mail and click the
   verification link Cloudflare emails to it. Forwarding does not work until it is verified.
   The verification email is also the receipt: if it isn't in the destination inbox, the
   step never happened, no matter what the DNS looks like.
3. Under **Custom addresses**, route `scholarships@` → that destination, and confirm the
   rule is **enabled**.
4. Check the **catch-all** action for the zone while you're there. Its default is **Drop**,
   which is what makes a missing rule so hard to spot — see the note below.
5. Test it — but **not** by mailing the address from the destination inbox. See the note
   below on why that test lies.

Notes:

- **This does not conflict with Resend.** Resend's MX record lives on the
  `send.andresen-scholarships.org` subdomain, and the root domain has no MX of its own, so
  Email Routing can take the root without touching outbound mail. Verify before you commit
  to it: `dig MX andresen-scholarships.org` should be empty beforehand.
- **⚠️ Don't test by mailing the address from the destination inbox.** This is the one that
  has actually bitten this project (2026-08-11). If `scholarships@` forwards to a Gmail
  account and you send the test *from that same Gmail account*, the forwarded copy comes back
  carrying the `Message-ID` Gmail already has in **Sent** — and Gmail suppresses it as a
  duplicate instead of delivering it. It is discarded at delivery, so it appears in no
  folder: not inbox, not spam, not trash, and no bounce is generated. Forwarding can be
  working perfectly and the test still looks like a total failure. Send the test from an
  unrelated address (a phone carrier address, a work account, a friend) and confirm it lands
  in the destination inbox — that's the only test that means anything.
- **Correct DNS proves nothing about delivery.** Enabling Email Routing adds the MX and SPF
  records immediately, at step 1 — before any destination is verified and before any rule
  exists. So `dig MX` can look perfect while mail to `scholarships@` goes nowhere. If a
  message neither arrives nor bounces, the disposition is in **Email Routing → Activity Log**,
  which logs every inbound message as forwarded, dropped, or rejected. Check that before
  theorising about DNS — it answers the question directly.
- **A disabled catch-all bounces; an enabled one on Drop hides.** With the catch-all
  **Disabled**, mail to an unrouted address is rejected and the sender gets a bounce. Left
  **enabled on its `Drop` default**, Cloudflare accepts the message and silently discards it —
  no delivery and no bounce, which reads exactly like mail vanishing in transit. Disabled is
  the friendlier setting: a bounce tells you something is wrong.
- Email Routing **forwards**, it does not host a mailbox. Replying to a student from the
  forwarded copy goes out *from* the destination inbox, not from `scholarships@`, so the
  applicant sees a personal Gmail address. Fixing that is §5c.
- Changing the address means changing it in three places: `CONTACT_EMAIL` in **both**
  `[vars]` and `[env.preview.vars]`, the `mailto:` links in the page footers, and the
  Email Routing rule.

## 5c. Replying *as* the contact address (Gmail "Send mail as" + Resend SMTP)

§5b gets mail *to* `scholarships@` into a real inbox. This step lets you answer *from* it, so
a student sees the scholarship address instead of a trustee's personal Gmail. Gmail can't do
this alone — it needs an SMTP relay authorised to send as the address, which is Resend, the
same service the site already sends through.

1. In **Resend → API Keys**, create a *new* key (sending permission is enough) named something
   like `gmail-send-as`. Don't reuse the site's `RESEND_API_KEY`: Resend shows a key only once
   at creation, and a separate key means rotating or revoking one can't break the other.
2. Gmail → **Settings** (gear) → **See all settings** → **Accounts and Import** →
   **Send mail as** → **Add another email address**.
3. Name: `Andresen Scholarships`. Address: `scholarships@andresen-scholarships.org`.
   Leave **"Treat as an alias" checked** — it's your own role address, and checked is what
   makes Gmail default the From to `scholarships@` when you reply to mail sent there. That
   auto-selection is the whole point; unchecked, every reply needs the From switched by hand.
4. On the next screen choose **Send through SMTP server** and enter:
   - **SMTP server:** `smtp.resend.com`
   - **Port:** `465` (implicit SSL/TLS). `587` with STARTTLS also works; `25`, `2465` and
     `2587` are supported too, and `2465`/`2587` exist for networks that block the usual pair.
   - **Username:** `resend` — the literal word, not an email address or the key's name.
   - **Password:** the API key from step 1.
   - **Secured connection using SSL** (match this to the port: SSL for 465, TLS for 587).
5. Gmail emails a confirmation code to `scholarships@`, which Email Routing forwards to the
   destination inbox. Enter the code to finish.
6. Send one real reply and check the recipient sees `scholarships@andresen-scholarships.org`
   as the sender.

Notes:

- **The §5b self-test trap does not apply to step 5.** That confirmation is generated by
  Google's servers, not sent from your account, so there's no copy in your **Sent** and
  nothing for Gmail to suppress as a duplicate. It lands normally.
- **Sending as the address requires the verified domain**, which is already done — Resend
  won't relay for a domain it hasn't verified. Alignment stays correct: Resend DKIM-signs as
  the root domain and bounces go to `send.`, exactly as for the site's own mail.
- **These replies count against the same Resend quota** as the application emails (free tier:
  100/day, 3,000/month). Board correspondence at ~40 applicants doesn't come close.
- Each trustee who answers mail needs this set up in *their* Gmail, with **their own** API
  key. Right now the routing rule forwards to one destination, so in practice that's one
  person — revisit if the board adds more.

## 6. Bot protection (Turnstile)

**Already done** for this project — the widget exists, in **Managed** mode, covering
`andresen-scholarships.org`, `www.`, `preview.` and `localhost`. Its site key is in
`apply.html`. Repeat these steps only if you ever rotate the keys or move domains.

1. In Cloudflare → Turnstile, create a widget listing every hostname the form is served
   from — production, `www`, the preview domain, and `localhost` for `npm.cmd run dev`.
   A hostname that isn't listed makes the widget refuse to render there.
2. Put the **site key** into `apply.html` (the `data-sitekey` attribute). It is public by
   design and belongs in the repo.
3. Add the **secret key** as the `TURNSTILE_SECRET` secret (step 7), for **both**
   Production and Preview. Until you do, `verifyTurnstile()` returns true without
   checking anything — the widget renders, but it gates nothing.

## 7. Deploy

Your repo is already connected to Cloudflare Pages, so **push the branch**:

```bash
git push origin main
```

`main` is the production branch and serves andresen-scholarships.org. To review a change
before it goes live, push it to any other branch first — Cloudflare builds a **preview URL**
for it that you can share with the board — then merge to `main` when approved.

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
