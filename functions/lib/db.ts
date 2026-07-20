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
  financing_plan: string | null;
  work_during_school: string | null;
  other_scholarships: string | null;
  pct_parents: string | null;
  parent_income: string | null;
  num_dependents: string | null;
  dependent_ages: string | null;
  parent_occupations: string | null;
  transcript_key: string | null;
  essay_key: string | null;
  applicant_sig_key: string | null;
  parent_sig_key: string | null;
}

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
  "financing_plan", "work_during_school", "other_scholarships", "pct_parents",
  "parent_income", "num_dependents", "dependent_ages", "parent_occupations",
  "transcript_key", "essay_key", "applicant_sig_key", "parent_sig_key",
] as const;

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
  scholarship: string;
  status: string;
  created_at: string;
  rec_status: string | null;
}

export async function listApplications(env: Env): Promise<ApplicationListItem[]> {
  const result = await env.DB.prepare(
    `SELECT a.id, a.full_name, a.email, a.scholarship, a.status, a.created_at,
            r.status AS rec_status
       FROM applications a
       LEFT JOIN recommendations r ON r.application_id = a.id
      ORDER BY a.created_at DESC`
  ).all<ApplicationListItem>();
  return result.results ?? [];
}
