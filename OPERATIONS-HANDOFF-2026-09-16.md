# Operations improvements — handoff for Claude

Prepared September 16, 2026. This document records a repository review and Dylan's response; it is a proposed implementation brief, not a report of implemented features.

## Purpose and authority

Make the existing board dashboard more useful for a tiny family-run charity, concentrating on recommendation follow-up, application corrections, and tracking scholarship checks through clearing. The repository describes roughly 40 applicants annually and two $1,500 scholarships.

Read the current `project-hub/USER-INSTRUCTIONS.md`, `project-hub/PUBLISH.md`, and this repository's `CLAUDE.md` before implementation. Check current repository state; the observations below describe the code reviewed on September 16.

Dylan explicitly requested this Markdown handoff on main so Claude can build the features in a later session. That permission covers the handoff, not launching future website changes. Follow the public-site branch, preview, and approval workflow for implementation. No application code, database records, settings, or emails were changed during this handoff.

## Dylan's context — exact words

> The checks are handed out at graduation, but my parents have complained the students sometimes lose them, graduation is a hectic time. They might have already decided on a solution though, i can’t remember, i think adding a payment tracking feature to update when checks are cashed is useful.

> I think the SAT scores and other stuff are useful flavor for us when reading the applications which is really what my mom enjoys and takes out of the experience.

> I don’t know the exact times yet, it hasn’t been decided.

> Your top priorities are the best ideas, can you flesh that out in a markdown file in the repo, and push that to main? Add additional context from my response here. I’m gonna have claude build it because i have more usage left there at the moment

The remainder is assistant-authored interpretation and recommendations, not additional quotations or standing instructions from Dylan.

These comments change the earlier review: preserve SAT/ACT scores, class information, and the other personal/academic details. Reading about the students is part of the charity's value to the family, even when those details do not determine awards. Do not remove or make fields optional as part of this work. Financial questions already removed remain removed.

Keep the current graduation handoff context, but do not decide how checks should be distributed in future. The parents may already have chosen a solution to lost checks. Exact cutoff times, recommendation deadlines, and announcement timing remain undecided; do not invent them or introduce automatic cutoff behavior in this scope.

## 1. Recommendation follow-up

### Current behavior

The dashboard filters applications awaiting recommendations and provides a private link the board can copy. A teacher request is sent after application submission. When a recommendation arrives, the board is notified, but the applicant is not. There is no dashboard resend action or teacher-address correction. Email provider errors are logged in technical output rather than recorded beside the application. The applicant confirmation says the teacher has been emailed even when sending may have failed.

Relevant files: `assets/js/admin.js`, `functions/lib/email.ts`, `functions/api/apply.ts`, `functions/api/recommendation/[token].ts`, and `functions/api/admin/application/[id].ts`.

### Proposed first version

- Add an explicit “Resend recommendation request” action for pending recommendations, showing the intended recipient and last attempt. Keep the existing copy-link fallback.
- Let the board correct the teacher's name/email. Make saving a correction and sending an email explicit actions, so editing does not silently contact someone.
- Record request attempts with time, recipient, outcome, and provider message ID when available. Show failures and provide a retry action. Provider acceptance means accepted for sending, not proof that a teacher received or read it; use accurate labels.
- Send an applicant confirmation when the recommendation is successfully recorded, without sharing recommendation text, attachments, or the private teacher link. Avoid duplicate confirmations on retries.
- Keep application submission successful if email fails, but make that failure visible to the board and avoid claiming delivery in the applicant-facing copy.
- Prevent accidental duplicate sends from repeated clicks. Keep reminders manual initially; automatic schedules can wait for actual deadline decisions.
- Send separate messages to separate applicants. Reuse the existing contact address and Reply-To behavior. Integrate with the email history anticipated in `CLAUDE.md` rather than creating a competing logging system.

If the teacher is changed, rotate the private token so a link sent to the wrong person cannot still submit. Preserve an already-submitted recommendation; replacing a recommender after submission should require an explicit decision rather than silently deleting their response.

Success means a trustee can see who is waiting, whether a request failed, correct an address, and resend without asking Dylan to edit the database.

## 2. Application corrections and duplicate handling

### Current behavior

The admin update route accepts review status, score, and shared notes only. Ordinary contact/college details cannot be corrected there. The duplicate check rejects matching email OR phone within the season. This blocks two students sharing a family phone; the current documentation describes deleting the earlier application as a workaround.

Relevant files: `functions/lib/db.ts`, `functions/api/apply.ts`, `functions/api/admin/application/[id].ts`, `assets/js/admin.js`, and `functions/lib/validation.ts`.

### Proposed first version

- Provide a small board-only edit form for name, email, phone, address, school, college, major, and teacher contact details as appropriate. Preserve review notes, documents, recommendation state, and payment records.
- Retain the originally submitted information and record corrections with time, changed fields, before/after values, and an optional reason. Do not attribute edits to an identified trustee unless the login system actually identifies that person; the present shared password does not.
- Treat a shared phone number as a potential duplicate for review rather than an automatic rejection. Keep the one-application-per-student, one-scholarship policy.
- Preserve protection against an actual repeat submission, including same-email retries, without deleting the first record. Make the board's resolution path clear if two genuine applicants share other contact details.
- Distinguish saving changes from resending confirmations or recommendation requests. Preserve recommendation confidentiality during corrections.
- Keep server-side validation authoritative and show errors next to the affected fields. Do not silently rewrite applicant statements or academic information.

Success means a trustee can fix an ordinary typo or college change while retaining what was originally submitted, and siblings sharing a phone can both apply.

## 3. Check tracking through clearing

### Current behavior and desired outcome

Application status currently ends at “Awarded” or “Not awarded.” There are no structured check or clearing fields. Checks have been handed out at graduation, and students sometimes lose them. Dylan specifically finds tracking when checks are cashed useful.

“Awarded,” “check issued,” “check handed out,” and “check cashed/cleared” must be distinct facts. An award approval must not mark a check as paid or cleared.

### Proposed first version

Use manual entry by the board, based on its existing bank records. No bank connection, money movement, check issuance, or automated stop-payment action is proposed.

For each check, record the related applicant/season, amount, payee, check number/reference, issue date, optional handoff date, clearing status/date, and a short note. A clearing date can remain unknown; if the board only knows when it checked the statement, record that as the confirmation date rather than inventing the bank's clearing date.

Support the practical cases:

- Award approved, no check issued yet.
- Check issued, awaiting handoff.
- Check handed out, not yet confirmed cleared.
- Check confirmed cashed/cleared.
- Check reported lost, with follow-up still needed.
- Check voided or stop-payment confirmed, with a replacement linked to it.

A reported-lost check is not automatically void, and entering a status does not instruct the bank to stop payment. Preserve the old check when a replacement is recorded instead of overwriting its number. Store checks as records related to an application so a replacement history is possible without a large accounting system.

Give the dashboard simple filters for awards needing checks, outstanding checks, and lost-check follow-up. Show outstanding amounts using clearly defined treatment of voided/replaced checks; do not double-count the original and replacement as two scholarship awards. Include check history and relevant dates in an export the family can reconcile with its own records.

Allow correction of an accidental “cleared” entry with history. Keep fields optional for older records; do not populate historical clearing information from assumptions.

Success means the family can answer “Whose check is still outstanding?” and “Was this lost check replaced, and did the replacement clear?” in one place.

## Implementation scope and validation

Build on the existing dashboard and authentication. Keep the experience small and readable; no student account portal, general accounting package, or replacement application system is needed.

Use additive database migrations and preserve existing submissions. Preview currently shares production D1/R2 resources according to `wrangler.toml`; do not experiment on real records or send test mail to families. Use local fixtures or isolated preview resources before testing writes. Isolating preview is a relevant implementation precaution, not a reason to expand this into a platform rewrite.

Meaningful checks should cover failed email followed by successful retry; repeated resend clicks; corrected teacher address with the old token invalidated; confidential recommendation confirmation; two students sharing a phone; a true repeat application; a correction preserving original data; and the full original-check/lost-check/replacement/cleared sequence without double-counting. Verify an existing application remains readable after migration and that admin write routes remain protected.

Provide a brief board-facing guide for the new actions. Update architecture documentation to reflect what is actually built. Full archive/backup tooling, automatic deadline management, a broad email composer, and a redesigned graduation distribution process are outside this first pass.

## Decisions left open

The family may already have solved the graduation handoff problem; confirm that before proposing a new distribution method. Exact application/recommendation cutoff times and decision announcements are undecided. The source of clearing updates, who enters them, and whether the family already keeps a payment ledger should be established when connecting the feature to everyday use. These unknowns do not prevent building manual tracking with optional dates.

## Review basis and limitations

The review read the repository's application, dashboard, email, database, recommendation, and configuration code plus `CLAUDE.md` and `SETUP.md`. It did not inspect a logged-in production dashboard, actual applicant records, bank records, or the family's existing payment ledger. Public web retrieval returned an older-looking page inconsistent with current main, so current repository source—not that cached page—was used for implementation findings. Recheck actual deployed behavior during implementation.
