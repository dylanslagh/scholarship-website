# Andresen Memorial Scholarships

The official website **and** self-hosted application system for the Harold A. and Marilyn Kay
Andresen Charitable Trust. The site presents the scholarships and the Andresen family legacy, and
lets graduating seniors in Carroll County, Illinois apply online — replacing the old JotForm setup
starting with the 2027 season.

## Features

- **Scholarship information** — detail pages for the Andresen Ag and Andresen Memorial scholarships.
- **Legacy section** — honors the memory of Harold, Kay, Randy, and Rodney Andresen.
- **Online application** — form with file uploads (transcript, essay) and signature capture.
- **Confidential teacher recommendation** — submitted through a private tokenized link.
- **Board dashboard** — password-gated review tools: filtering, scoring, notes, and CSV export.
- **Responsive design** — works on desktop, tablet, and mobile.

## Technologies

- **HTML5 & CSS3** — a hand-rolled design system in `assets/css/site.css` (no template or framework).
- **Vanilla JavaScript** — no jQuery.
- **Cloudflare Pages Functions (TypeScript)** — the backend in `functions/`.
- **Cloudflare D1** (SQLite) for records, **R2** for uploaded files, **Resend** for email.
- **Google Fonts** — Fraunces and Public Sans.

## Getting Started

The static pages can be opened directly in a browser, but the application system needs the
Cloudflare tooling. See **[SETUP.md](SETUP.md)** for the full walkthrough. In short:

```bash
npm install
npm run dev        # http://localhost:8788
```

## Project Structure

- `index.html`, `ag-scholarship.html`, `scholarship.html` — public info pages.
- `apply.html`, `recommend.html`, `admin.html` — application form, teacher recommendation, board dashboard.
- `assets/css/site.css` — the whole design system. `assets/js/` — front-end scripts.
- `functions/` — Cloudflare Pages Functions (API) and shared library code.
- `schema.sql`, `migrations/` — D1 database schema.
- `CLAUDE.md` — context and architecture notes for contributors.

## Branches

- `main` is production (`andresen-scholarships.org`).
- **`preview` must stay.** `preview.andresen-scholarships.org` is bound to a branch literally
  named `preview`, so deleting or renaming it takes the preview site down. It is a long-lived
  review branch, not a leftover. It is fine for it to sit behind `main`; fast-forward it to
  `main` when you want the preview to match production.

## License

All content, including text and family photographs, is copyright of the
**Harold A. and Marilyn Kay Andresen Charitable Trust**. All rights reserved.
