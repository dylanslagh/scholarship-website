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

// One application per student, to one scholarship. A repeat email address or
// phone number from the same season is treated as the same applicant.
export interface DuplicateMatch {
  field: "email" | "phone";
  existing: { full_name: string; scholarship: string; created_at: string };
}

// Compare on digits only, so "(815) 555-0134" and "815-555-0134" are one number.
// Anything shorter than a real phone number is ignored rather than matched loosely.
function phoneKey(value: string | null): string {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}

export async function findDuplicateApplication(
  env: Env,
  email: string,
  phone: string,
  sinceISO: string
): Promise<DuplicateMatch | null> {
  // ~40 applications a season, so scanning them beats clever SQL normalisation.
  const { results } = await env.DB.prepare(
    `SELECT full_name, email, phone, scholarship, created_at
       FROM applications
      WHERE created_at >= ?
      ORDER BY created_at`
  ).bind(sinceISO).all<{
    full_name: string; email: string; phone: string | null;
    scholarship: string; created_at: string;
  }>();

  const wantEmail = email.trim().toLowerCase();
  const wantPhone = phoneKey(phone);

  for (const row of results || []) {
    const existing = {
      full_name: row.full_name,
      scholarship: row.scholarship,
      created_at: row.created_at,
    };
    if (wantEmail && row.email && row.email.trim().toLowerCase() === wantEmail) {
      return { field: "email", existing };
    }
    if (wantPhone && phoneKey(row.phone) === wantPhone) {
      return { field: "phone", existing };
    }
  }
  return null;
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

export async function markRecommendationSubmitted(
  env: Env, token: string, fileKey: string | null, text: string | null
): Promise<void> {
  await env.DB.prepare(
    `UPDATE recommendations
       SET status = 'submitted', rec_file_key = ?, rec_text = ?, submitted_at = ?
     WHERE token = ?`
  ).bind(fileKey, text, new Date().toISOString(), token).run();
}

// List applications with their recommendation status for the admin dashboard.
export interface ApplicationListItem {
  id: string;
  full_name: string;
  email: string;
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
}

export async function listApplications(env: Env): Promise<ApplicationListItem[]> {
  const result = await env.DB.prepare(
    `SELECT a.id, a.full_name, a.email, a.high_school, a.parent_names,
            a.college, a.major, a.gpa,
            a.scholarship, a.status, a.score, a.created_at,
            r.status AS rec_status
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
