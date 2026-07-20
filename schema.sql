-- Andresen Scholarships application database (Cloudflare D1 / SQLite).
-- Apply with:  npm run db:init:local   (local)  /  npm run db:init:remote  (production)

CREATE TABLE IF NOT EXISTS applications (
  id            TEXT PRIMARY KEY,
  scholarship   TEXT NOT NULL,            -- 'ag' | 'memorial'
  status        TEXT NOT NULL DEFAULT 'submitted',  -- 'submitted' | 'reviewed'
  created_at    TEXT NOT NULL,            -- ISO 8601 timestamp

  -- General information
  full_name     TEXT NOT NULL,
  phone         TEXT,
  email         TEXT NOT NULL,
  address       TEXT,
  high_school   TEXT,
  college       TEXT,
  date_accepted TEXT,
  major         TEXT,
  parent_names  TEXT,

  -- Academic information
  gpa           TEXT,
  class_rank    TEXT,
  class_size    TEXT,
  act_sat       TEXT,
  awards        TEXT,
  activities    TEXT,

  -- Financial information
  financing_plan     TEXT,
  work_during_school TEXT,               -- 'Yes' | 'No'
  other_scholarships TEXT,               -- 'Yes' | 'No'
  pct_parents        TEXT,
  parent_income      TEXT,               -- income bracket
  num_dependents     TEXT,
  dependent_ages     TEXT,
  parent_occupations TEXT,

  -- Uploaded file keys (objects live in R2)
  transcript_key    TEXT,
  essay_key         TEXT,
  applicant_sig_key TEXT,
  parent_sig_key    TEXT
);

CREATE INDEX IF NOT EXISTS idx_applications_created_at ON applications(created_at);

CREATE TABLE IF NOT EXISTS recommendations (
  id             TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id),
  teacher_name   TEXT NOT NULL,
  teacher_email  TEXT NOT NULL,
  token          TEXT NOT NULL UNIQUE,   -- random, unguessable; used in the teacher link
  status         TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'submitted'
  rec_file_key   TEXT,
  rec_text       TEXT,
  created_at     TEXT NOT NULL,
  submitted_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_recommendations_application ON recommendations(application_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_token ON recommendations(token);
