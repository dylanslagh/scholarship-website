import type { Env } from "../../../../lib/env";
import { json } from "../../../../lib/env";
import { getApplicationById, reserveEmailSend } from "../../../../lib/db";
import { getCheck, formatCents } from "../../../../lib/checks";
import { emailCheckReminder } from "../../../../lib/email";
import { SCHOLARSHIP_LABELS } from "../../../apply";

// Same two-minute guard as the teacher request: one press, one email.
const REMINDER_WINDOW_SECONDS = 120;

// POST: email the student a reminder to cash a check they've been handed.
export const onRequestPost: PagesFunction<Env> = async ({ env, params }) => {
  const check = await getCheck(env, String(params.id || ""));
  if (!check) return json({ ok: false, error: "Check not found." }, 404);
  // A check that hasn't reached the student, or is already cashed, lost or void,
  // is nothing a reminder can help with.
  if (check.status !== "handed_out") {
    return json({
      ok: false,
      error: "Reminders are only for checks marked handed out and not yet cashed.",
    }, 409);
  }
  const app = await getApplicationById(env, check.application_id);
  if (!app) return json({ ok: false, error: "Application not found." }, 404);

  const reservation = await reserveEmailSend(env, app.id, "check_reminder", REMINDER_WINDOW_SECONDS);
  if ("recent" in reservation) {
    return json({
      ok: false,
      recent_at: reservation.recent,
      error: "A reminder was sent to this student in the last two minutes.",
    }, 429);
  }

  const result = await emailCheckReminder(
    env, app.id, app.email, app.full_name,
    SCHOLARSHIP_LABELS[app.scholarship] || "Andresen Scholarship",
    check.check_number, formatCents(check.amount_cents), reservation.id
  );
  if (!result || result.outcome === "failed") {
    return json({
      ok: false,
      outcome: "failed",
      error: `The reminder couldn't be sent${result?.error ? ` (${result.error})` : ""}. Check the student's email address, then try again.`,
    }, 502);
  }
  return json({ ok: true, outcome: result.outcome, recipient: app.email });
};
