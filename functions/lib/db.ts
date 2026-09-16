import type { Env } from "./env";

export interface ApplicationRecord {
  id: string;
  scholarship: string;
  status: string;
  created_at: string;
  full_name: string;
  phone: string | null;
  email: string;
  address: string | null;
  high_school: string | null;
  college: string | null;
  date_accepted: string | null;
  major: string | null;
  parent_names: string | null;
  gpa: string | null;
  class_rank: string | null;
  class_size: string | null;
  act_sat: string | null;
  awards: string | null;
  activities: string | null;
  transcript_key: string | null;
  essay_key: string | null;
  applicant_sig_key: string | null;
  parent_sig_key: string | null;
  // Board review fields (not set at submission time)
  score?: number | null;
  board_notes?: string | null;
  phone_reviewed_at?: string | null;
}

export const APPLICATION_STATUSES = ["submitted", "in_review", "awarded", "not_awarded"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export interface RecommendationRecord {
  id: string;
  application_id: string;
  teacher_name: string;
  teacher_email: string;
  token: string;
  status: string;
  rec_file_key: string | null;
  rec_text: string | null;
  created_at: string;
  submitted_at: string | null;
}

const APP_COLUMNS = [
  "id", "scholarship", "status", "created_at",
  "full_name", "phone", "email", "address", "high_school", "college",
  "date_accepted", "major", "parent_names",
  "gpa", "class_rank", "class_size", "act_sat", "awards", "activities",
  "transcript_key", "essay_key", "applicant_sig_key", "parent_sig_key",
] as const;

// One application per student, to one scholarship. A repeat email address from
// the same season is treated as the same applicant and rejected. A shared phone
// number is not — brothers and sisters share a family phone — so that is only
// flagged for the board (see findPhoneMatches).
export interface DuplicateMatch {
  id: string;
  full_name: string;
  scholarship: string;
  created_at: string;
}

// Compare on digits only, so "(815) 555-0134" and "815-555-0134" are one number.
// Anything shorter than a real phone number is ignored rather than matched loosely.
export function phoneKey(value: string | null | undefined): string {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}

// Seasons run July through June, matching seasonStartISO() in env.ts, so a 2028
// sibling is never compared against a 2027 application.
export function seasonOf(iso: string): number {
  const d = new Date(iso);
  return d.getUTCMonth() >= 6 ? d.getUTCFullYear() + 1 : d.getUTCFullYear();
}

export async function findApplicationByEmail(
  env: Env,
  email: string,
  sinceISO: string,
  excludeId = ""
): Promise<DuplicateMatch | null> {
  const want = email.trim().toLowerCase();
  if (!want) return null;
  return await env.DB.prepare(
    `SELECT id, full_name, scholarship, created_at
       FROM applications
      WHERE created_at >= ? AND lower(trim(email)) = ? AND id != ?
      ORDER BY created_at
      LIMIT 1`
  ).bind(sinceISO, want, excludeId).first<DuplicateMatch>();
}

// Other applications from the same season sharing this one's phone number.
export interface PhoneMatch extends DuplicateMatch {
  phone_reviewed_at: string | null;
}

export async function findPhoneMatches(env: Env, app: ApplicationRecord): Promise<PhoneMatch[]> {
  const key = phoneKey(app.phone);
  if (!key) return [];
  // ~40 applications a season, so scanning them beats clever SQL normalisation.
  const { results } = await env.DB.prepare(
    `SELECT id, full_name, scholarship, created_at, phone, phone_reviewed_at
       FROM applications WHERE id != ? ORDER BY created_at`
  ).bind(app.id).all<PhoneMatch & { phone: string | null }>();
  const season = seasonOf(app.created_at);
  return (results || [])
    .filter((r) => phoneKey(r.phone) === key && seasonOf(r.created_at) === season)
    .map(({ phone: _phone, ...match }) => match);
}

export async function markPhoneReviewed(env: Env, ids: string[]): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.batch(
    ids.map((id) => env.DB.prepare("UPDATE applications SET phone_reviewed_at = ? WHERE id = ?").bind(now, id))
  );
}

export async function insertApplication(env: Env, app: ApplicationRecord): Promise<void> {
  const placeholders = APP_COLUMNS.map(() => "?").join(", ");
  const values = APP_COLUMNS.map((c) => (app as unknown as Record<string, unknown>)[c] ?? null);
  await env.DB.prepare(
    `INSERT INTO applications (${APP_COLUMNS.join(", ")}) VALUES (${placeholders})`
  ).bind(...values).run();
}

export async function insertRecommendation(env: Env, rec: RecommendationRecord): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO recommendations
       (id, application_id, teacher_name, teacher_email, token, status, rec_file_key, rec_text, created_at, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    rec.id, rec.application_id, rec.teacher_name, rec.teacher_email, rec.token,
    rec.status, rec.rec_file_key, rec.rec_text, rec.created_at, rec.submitted_at
  ).run();
}

export async function getApplicationById(env: Env, id: string): Promise<ApplicationRecord | null> {
  return await env.DB.prepare("SELECT * FROM applications WHERE id = ?")
    .bind(id).first<ApplicationRecord>();
}

export async function getRecommendationByToken(env: Env, token: string): Promise<RecommendationRecord | null> {
  return await env.DB.prepare("SELECT * FROM recommendations WHERE token = ?")
    .bind(token).first<RecommendationRecord>();
}

export async function getRecommendationForApplication(env: Env, appId: string): Promise<RecommendationRecord | null> {
  return await env.DB.prepare("SELECT * FROM recommendations WHERE application_id = ? LIMIT 1")
    .bind(appId).first<RecommendationRecord>();
}

// Only a still-pending recommendation can be submitted. Returns false if another
// request got there first, so two near-simultaneous posts can't both send emails.
export async function markRecommendationSubmitted(
  env: Env, token: string, fileKey: string | null, text: string | null
): Promise<boolean> {
  const result = await env.DB.prepare(
    `UPDATE recommendations
       SET status = 'submitted', rec_file_key = ?, rec_text = ?, submitted_at = ?
     WHERE token = ? AND status = 'pending'`
  ).bind(fileKey, text, new Date().toISOString(), token).run();
  return (result.meta?.changes ?? 0) > 0;
}

// Correct the teacher on a recommendation that hasn't been submitted yet. The
// caller passes a fresh token when the address changes, which retires the old link.
export function updateRecommendationTeacherStatement(
  env: Env, id: string, fields: { teacher_name: string; teacher_email: string; token: string }
): D1PreparedStatement {
  return env.DB.prepare(
    `UPDATE recommendations SET teacher_name = ?, teacher_email = ?, token = ?
      WHERE id = ? AND status = 'pending'`
  ).bind(fields.teacher_name, fields.teacher_email, fields.token, id);
}

// List applications with their recommendation status for the admin dashboard.
export interface ApplicationListItem {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  phone_reviewed_at: string | null;
  high_school: string | null;
  parent_names: string | null;
  college: string | null;
  major: string | null;
  gpa: string | null;
  scholarship: string;
  status: string;
  score: number | null;
  created_at: string;
  rec_status: string | null;
  last_request_outcome: string | null; // newest teacher-request email, if any
}

export async function listApplications(env: Env): Promise<ApplicationListItem[]> {
  const result = await env.DB.prepare(
    `SELECT a.id, a.full_name, a.email, a.phone, a.phone_reviewed_at,
            a.high_school, a.parent_names, a.college, a.major, a.gpa,
            a.scholarship, a.status, a.score, a.created_at,
            r.status AS rec_status,
            (SELECT e.outcome FROM email_log e
              WHERE e.application_id = a.id AND e.kind = 'teacher_request'
              ORDER BY e.created_at DESC LIMIT 1) AS last_request_outcome
       FROM applications a
       LEFT JOIN recommendations r ON r.application_id = a.id
      ORDER BY a.created_at DESC`
  ).all<ApplicationListItem>();
  return result.results ?? [];
}

// Update the board-review fields on an application.
export async function updateApplicationReview(
  env: Env,
  id: string,
  fields: { status?: string; score?: number | null; board_notes?: string | null }
): Promise<boolean> {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (fields.status !== undefined) { sets.push("status = ?"); values.push(fields.status); }
  if (fields.score !== undefined) { sets.push("score = ?"); values.push(fields.score); }
  if (fields.board_notes !== undefined) { sets.push("board_notes = ?"); values.push(fields.board_notes); }
  if (!sets.length) return false;
  const result = await env.DB.prepare(
    `UPDATE applications SET ${sets.join(", ")} WHERE id = ?`
  ).bind(...values, id).run();
  return (result.meta?.changes ?? 0) > 0;
}

// Contact and college details the board may correct. Academic answers are left
// out on purpose: the board reads those as the student wrote them.
export const EDITABLE_APPLICATION_FIELDS = [
  "full_name", "email", "phone", "address", "high_school",
  "college", "date_accepted", "major", "parent_names",
] as const;
export type EditableApplicationField = (typeof EDITABLE_APPLICATION_FIELDS)[number];

export function updateApplicationDetailsStatement(
  env: Env, id: string, fields: Partial<Record<EditableApplicationField, string | null>>
): D1PreparedStatement {
  const keys = (EDITABLE_APPLICATION_FIELDS as readonly EditableApplicationField[])
    .filter((k) => fields[k] !== undefined);
  return env.DB.prepare(
    `UPDATE applications SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`
  ).bind(...keys.map((k) => fields[k] ?? null), id);
}

/* ---------- Email log ---------- */

export interface EmailLogRecord {
  id: string;
  application_id: string | null;
  kind: string;
  recipients: string;
  subject: string;
  outcome: string; // 'sending' | 'accepted' | 'failed' | 'logged'
  provider_id: string | null;
  error: string | null;
  created_at: string;
}

export async function insertEmailLog(env: Env, row: EmailLogRecord): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO email_log (id, application_id, kind, recipients, subject, outcome, provider_id, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    row.id, row.application_id, row.kind, row.recipients, row.subject,
    row.outcome, row.provider_id, row.error, row.created_at
  ).run();
}

export async function completeEmailLog(
  env: Env, id: string,
  row: Pick<EmailLogRecord, "recipients" | "subject" | "outcome" | "provider_id" | "error">
): Promise<void> {
  await env.DB.prepare(
    "UPDATE email_log SET recipients = ?, subject = ?, outcome = ?, provider_id = ?, error = ? WHERE id = ?"
  ).bind(row.recipients, row.subject, row.outcome, row.provider_id, row.error, id).run();
}

// Claim the right to send one kind of email for an application, unless one was
// sent (or is mid-send) within the last `windowSeconds`. A single INSERT ... WHERE
// NOT EXISTS, so two clicks racing each other can't both win. Failed sends don't
// count, so a retry after a failure is never blocked.
export async function reserveEmailSend(
  env: Env, applicationId: string, kind: string, windowSeconds: number
): Promise<{ id: string } | { recent: string }> {
  const id = crypto.randomUUID();
  const now = new Date();
  const since = new Date(now.getTime() - windowSeconds * 1000).toISOString();
  const result = await env.DB.prepare(
    `INSERT INTO email_log (id, application_id, kind, recipients, subject, outcome, created_at)
     SELECT ?, ?, ?, '', '', 'sending', ?
      WHERE NOT EXISTS (
        SELECT 1 FROM email_log
         WHERE application_id = ? AND kind = ? AND created_at >= ?
           AND outcome IN ('sending', 'accepted', 'logged'))`
  ).bind(id, applicationId, kind, now.toISOString(), applicationId, kind, since).run();
  if ((result.meta?.changes ?? 0) > 0) return { id };
  const recent = await env.DB.prepare(
    `SELECT created_at FROM email_log
      WHERE application_id = ? AND kind = ? AND outcome IN ('sending', 'accepted', 'logged')
      ORDER BY created_at DESC LIMIT 1`
  ).bind(applicationId, kind).first<{ created_at: string }>();
  return { recent: recent?.created_at || now.toISOString() };
}

export async function listEmailLog(env: Env, applicationId: string): Promise<EmailLogRecord[]> {
  const { results } = await env.DB.prepare(
    "SELECT * FROM email_log WHERE application_id = ? ORDER BY created_at DESC"
  ).bind(applicationId).all<EmailLogRecord>();
  return results || [];
}

/* ---------- Change log ---------- */

export interface FieldChange {
  field: string;
  before: string | null;
  after: string | null;
}

export interface ChangeLogRecord {
  id: string;
  application_id: string;
  entity: "application" | "recommendation" | "check";
  entity_id: string;
  changes: FieldChange[];
  reason: string | null;
  created_at: string;
}

export function changeLogStatement(
  env: Env, row: Omit<ChangeLogRecord, "id" | "created_at">
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO change_log (id, application_id, entity, entity_id, changes, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(), row.application_id, row.entity, row.entity_id,
    JSON.stringify(row.changes), row.reason, new Date().toISOString()
  );
}

export async function listChangeLog(env: Env, applicationId: string): Promise<ChangeLogRecord[]> {
  const { results } = await env.DB.prepare(
    "SELECT * FROM change_log WHERE application_id = ? ORDER BY created_at DESC"
  ).bind(applicationId).all<Omit<ChangeLogRecord, "changes"> & { changes: string }>();
  return (results || []).map((r) => {
    let changes: FieldChange[] = [];
    try { changes = JSON.parse(r.changes); } catch { /* leave empty */ }
    return { ...r, changes };
  });
}

// Compare new values against the stored row; blank and null count as the same.
export function diffFields(
  before: Record<string, unknown>, after: Record<string, string | null>
): FieldChange[] {
  const out: FieldChange[] = [];
  for (const [field, value] of Object.entries(after)) {
    const old = before[field] == null || before[field] === "" ? null : String(before[field]);
    const next = value == null || value === "" ? null : value;
    if (old !== next) out.push({ field, before: old, after: next });
  }
  return out;
}

// Full rows joined with recommendation info, for the CSV export.
export interface ApplicationExportRow extends ApplicationRecord {
  teacher_name: string | null;
  teacher_email: string | null;
  rec_status: string | null;
  rec_submitted_at: string | null;
}

export async function listApplicationsFull(env: Env): Promise<ApplicationExportRow[]> {
  const result = await env.DB.prepare(
    `SELECT a.*,
            r.teacher_name, r.teacher_email,
            r.status AS rec_status, r.submitted_at AS rec_submitted_at
       FROM applications a
       LEFT JOIN recommendations r ON r.application_id = a.id
      ORDER BY a.created_at DESC`
  ).all<ApplicationExportRow>();
  return result.results ?? [];
}
