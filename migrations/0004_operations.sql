-- Board operations: email history, correction history, scholarship checks, and
-- the shared-phone review flag. Purely additive — nothing existing is changed.
--
-- Apply with:  npm run db:migrate:local  /  npm run db:migrate:remote
-- If the remote --file import fails (see CLAUDE.md), run each statement as its own
-- `wrangler d1 execute --remote --command "…"`. The CREATEs are safe to re-run; the
-- ALTER is not (SQLite has no IF NOT EXISTS for ADD COLUMN).

-- Every email the system tries to send, one row per message. Answers "did we
-- already tell this student?" and shows the board a failed teacher request.
-- outcome: 'sending' (reserved, not finished) | 'accepted' (Resend took it — not
-- proof of delivery) | 'failed' | 'logged' (demo mode, never sent).
CREATE TABLE IF NOT EXISTS email_log (
  id             TEXT PRIMARY KEY,
  application_id TEXT,                    -- null for mail not about one application
  kind           TEXT NOT NULL,           -- e.g. 'teacher_request', 'applicant_confirmation'
  recipients     TEXT NOT NULL,           -- comma-separated
  subject        TEXT NOT NULL,
  outcome        TEXT NOT NULL,
  provider_id    TEXT,                    -- Resend message id, when accepted
  error          TEXT,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_log_application ON email_log(application_id, created_at);

-- Board edits, one row per save. `changes` is JSON: [{"field","before","after"}].
-- entity: 'application' | 'recommendation' | 'check'. The earliest `before` for a
-- field is what the applicant originally submitted.
CREATE TABLE IF NOT EXISTS change_log (
  id             TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  entity         TEXT NOT NULL,
  entity_id      TEXT NOT NULL,
  changes        TEXT NOT NULL,
  reason         TEXT,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_change_log_application ON change_log(application_id, created_at);

-- Scholarship checks, entered by hand from the family's own bank records. A
-- replacement is a new row pointing at the check it replaces; the old row is kept.
-- status: 'issued' | 'handed_out' | 'cleared' | 'lost' | 'void'
CREATE TABLE IF NOT EXISTS checks (
  id                TEXT PRIMARY KEY,
  application_id    TEXT NOT NULL REFERENCES applications(id),
  amount_cents      INTEGER NOT NULL,
  payee             TEXT,
  check_number      TEXT,
  status            TEXT NOT NULL DEFAULT 'issued',
  issued_on         TEXT,                 -- YYYY-MM-DD
  handed_out_on     TEXT,
  cleared_on        TEXT,                 -- the bank's clearing date, if known
  confirmed_on      TEXT,                 -- when the board saw it on a statement
  replaces_check_id TEXT REFERENCES checks(id),
  note              TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_checks_application ON checks(application_id);

-- Set when the board confirms that applications sharing this one's phone number
-- are different students (siblings), so the dashboard stops flagging it.
ALTER TABLE applications ADD COLUMN phone_reviewed_at TEXT;
