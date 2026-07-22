import type { Env } from "../../../lib/env";
import { json, badRequest } from "../../../lib/env";
import {
  getApplicationById,
  getRecommendationForApplication,
  updateApplicationReview,
  APPLICATION_STATUSES,
} from "../../../lib/db";
import { SCHOLARSHIP_LABELS } from "../../apply";

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const id = String(params.id || "");
  const app = await getApplicationById(env, id);
  if (!app) return json({ ok: false, error: "Application not found." }, 404);

  const rec = await getRecommendationForApplication(env, id);

  return json({
    ok: true,
    application: app,
    scholarship_label: SCHOLARSHIP_LABELS[app.scholarship] || app.scholarship,
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
