import type { Env } from "../../../../lib/env";
import { json } from "../../../../lib/env";
import {
  getApplicationById,
  getRecommendationForApplication,
  reserveEmailSend,
} from "../../../../lib/db";
import { emailTeacherRequest } from "../../../../lib/email";
import { SCHOLARSHIP_LABELS } from "../../../apply";

// Two minutes between requests, so a double-click (or two trustees clicking at
// once) sends one email, not two. A failed send doesn't start the clock.
const RESEND_WINDOW_SECONDS = 120;

// POST: email the teacher their private recommendation link again.
export const onRequestPost: PagesFunction<Env> = async ({ env, params }) => {
  const id = String(params.id || "");
  const [app, rec] = await Promise.all([
    getApplicationById(env, id),
    getRecommendationForApplication(env, id),
  ]);
  if (!app || !rec) return json({ ok: false, error: "Application not found." }, 404);
  if (rec.status === "submitted") {
    return json({ ok: false, error: "This recommendation has already been received." }, 409);
  }

  const reservation = await reserveEmailSend(env, id, "teacher_request", RESEND_WINDOW_SECONDS);
  if ("recent" in reservation) {
    return json({
      ok: false,
      recent_at: reservation.recent,
      error: "A request was sent to this teacher in the last two minutes. Wait a moment before sending another.",
    }, 429);
  }

  const result = await emailTeacherRequest(
    env, id, rec.teacher_email, rec.teacher_name, app.full_name,
    SCHOLARSHIP_LABELS[app.scholarship] || "Andresen Scholarship",
    `${env.APP_BASE_URL}/recommend.html?token=${rec.token}`,
    reservation.id
  );

  if (!result || result.outcome === "failed") {
    return json({
      ok: false,
      outcome: "failed",
      error: `The email couldn't be sent${result?.error ? ` (${result.error})` : ""}. Check the address, then try again.`,
    }, 502);
  }
  return json({ ok: true, outcome: result.outcome, recipient: rec.teacher_email });
};
