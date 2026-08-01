import type { Env } from "./env";

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// Required text fields on the application (must be non-empty).
// Keep in sync with the `required` attributes in apply.html. Declaration order
// matches the form, so the client can focus the first offending field.
export const REQUIRED_FIELDS: Record<string, string> = {
  scholarship: "Scholarship selection",
  full_name: "Name",
  phone: "Phone number",
  email: "Email",
  address: "Mailing address",
  high_school: "High school",
  college: "College or school accepted at",
  major: "Major area of study",
  parent_names: "Parent/guardian name(s)",
  // Academic information — all required.
  gpa: "GPA",
  act_sat: "ACT/SAT score",
  class_rank: "Class rank",
  class_size: "Number of students in class",
  awards: "Awards/honors",
  activities: "Clubs/activities",
  // Teacher recommendation.
  teacher_name: "Teacher's name",
  teacher_email: "Teacher's email",
};

// A single problem, tied to the form field that caused it so the browser can
// highlight and focus it instead of printing one long combined paragraph.
export interface FieldError {
  field: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: FieldError[];
}

// Validate the parsed text fields of an application submission.
export function validateApplicationFields(fields: Record<string, string>): ValidationResult {
  const errors: FieldError[] = [];

  for (const [field, label] of Object.entries(REQUIRED_FIELDS)) {
    if (!fields[field] || !fields[field].trim()) {
      errors.push({ field, message: `${label} is required.` });
    }
  }

  if (fields.scholarship && !["ag", "memorial"].includes(fields.scholarship)) {
    errors.push({ field: "scholarship", message: "Scholarship must be Ag or Memorial." });
  }
  if (fields.email && !isEmail(fields.email)) {
    errors.push({ field: "email", message: "A valid email address is required." });
  }
  if (fields.teacher_email && !isEmail(fields.teacher_email)) {
    errors.push({ field: "teacher_email", message: "A valid teacher email address is required." });
  }

  return { ok: errors.length === 0, errors };
}

// Verify a Cloudflare Turnstile token. Skipped when no secret is configured
// (local development uses Turnstile's always-pass test keys).
export async function verifyTurnstile(env: Env, token: string, ip: string | null): Promise<boolean> {
  if (!env.TURNSTILE_SECRET) return true; // not configured -> skip (local/demo)
  const body = new FormData();
  body.append("secret", env.TURNSTILE_SECRET);
  body.append("response", token || "");
  if (ip) body.append("remoteip", ip);
  try {
    const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
    });
    const data = (await resp.json()) as { success: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
