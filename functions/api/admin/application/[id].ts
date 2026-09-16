import type { Env } from "../../../lib/env";
import { json, badRequest } from "../../../lib/env";
import {
  getApplicationById,
  getRecommendationForApplication,
  updateApplicationReview,
  findPhoneMatches,
  listEmailLog,
  listChangeLog,
  APPLICATION_STATUSES,
  EDITABLE_APPLICATION_FIELDS,
} from "../../../lib/db";
import { listChecksForApplication, summarizeChecks, CHECK_STATUS_LABELS } from "../../../lib/checks";
import { SCHOLARSHIP_LABELS } from "../../apply";

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const id = String(params.id || "");
  const app = await getApplicationById(env, id);
  if (!app) return json({ ok: false, error: "Application not found." }, 404);

  const [rec, emails, changes, checks, phoneMatches] = await Promise.all([
    getRecommendationForApplication(env, id),
    listEmailLog(env, id),
    listChangeLog(env, id),
    listChecksForApplication(env, id),
    findPhoneMatches(env, app),
  ]);

  // What the applicant first typed, for any field the board has since corrected:
  // the `before` of the oldest change to that field.
  const original: Record<string, string | null> = {};
  const editable = EDITABLE_APPLICATION_FIELDS as readonly string[];
  for (const entry of [...changes].reverse()) {
    if (entry.entity !== "application") continue;
    for (const c of entry.changes) {
      if (editable.includes(c.field) && !(c.field in original)) original[c.field] = c.before;
    }
  }

  // The shared-phone warning stays up until every application in the group has
  // been confirmed as a different student.
  const phoneNeedsReview = phoneMatches.length > 0 &&
    (!app.phone_reviewed_at || phoneMatches.some((m) => !m.phone_reviewed_at));

  return json({
    ok: true,
    application: app,
    scholarship_label: SCHOLARSHIP_LABELS[app.scholarship] || app.scholarship,
    original_values: original,
    phone_matches: phoneMatches.map((m) => ({
      ...m,
      scholarship_label: SCHOLARSHIP_LABELS[m.scholarship] || m.scholarship,
    })),
    phone_needs_review: phoneNeedsReview,
    // Board-only history. Recommendation text never appears in either list.
    emails,
    changes,
    checks,
    check_status_labels: CHECK_STATUS_LABELS,
    check_summary: summarizeChecks(app.status, checks),
    recommendation: rec
      ? {
          teacher_name: rec.teacher_name,
          teacher_email: rec.teacher_email,
          status: rec.status,
          rec_text: rec.rec_text,
          rec_file_key: rec.rec_file_key,
          submitted_at: rec.submitted_at,
          // Board-only: lets a trustee re-send the confidential link manually
          // if the original email didn't reach the teacher.
          link:
            rec.status === "submitted"
              ? null
              : `${env.APP_BASE_URL}/recommend.html?token=${rec.token}`,
        }
      : null,
  });
};

// Update board-review fields: status, score (1–5 or null), notes.
export const onRequestPatch: PagesFunction<Env> = async ({ env, params, request }) => {
  const id = String(params.id || "");

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const fields: { status?: string; score?: number | null; board_notes?: string | null } = {};

  if (body.status !== undefined) {
    const status = String(body.status);
    if (!(APPLICATION_STATUSES as readonly string[]).includes(status)) {
      return badRequest("Invalid status.");
    }
    fields.status = status;
  }

  if (body.score !== undefined) {
    if (body.score === null || body.score === "") {
      fields.score = null;
    } else {
      const score = Number(body.score);
      if (!Number.isInteger(score) || score < 1 || score > 5) {
        return badRequest("Score must be a whole number from 1 to 5.");
      }
      fields.score = score;
    }
  }

  if (body.board_notes !== undefined) {
    const notes = String(body.board_notes ?? "");
    if (notes.length > 10000) return badRequest("Notes are too long.");
    fields.board_notes = notes || null;
  }

  if (!Object.keys(fields).length) return badRequest("Nothing to update.");

  const updated = await updateApplicationReview(env, id, fields);
  if (!updated) return json({ ok: false, error: "Application not found." }, 404);
  return json({ ok: true });
};
