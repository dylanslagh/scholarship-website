-- Board review fields for the admin dashboard (2027 redesign).
-- Apply with:  npm run db:migrate:local  /  npm run db:migrate:remote
-- (Safe to re-run only on a database that hasn't had it; SQLite has no
--  IF NOT EXISTS for ADD COLUMN. Fresh installs get these via schema.sql.)

ALTER TABLE applications ADD COLUMN score INTEGER;      -- board score, 1–5
ALTER TABLE applications ADD COLUMN board_notes TEXT;   -- shared board notes
