import type { Env } from "../../../../lib/env";
import { json, badRequest } from "../../../../lib/env";
import {
  getRecommendationForApplication,
  updateRecommendationTeacherStatement,
  changeLogStatement,
  diffFields,
} from "../../../../lib/db";
import { isEmail } from "../../../../lib/validation";
import type { FieldError } from "../../../../lib/validation";
import { randomToken } from "../../../apply";

// POST: correct the teacher's name or email on a pending recommendation. Saves
// only — sending the request is a separate, explicit action. A new email address
// gets a new private link, so the old one (possibly sent to the wrong person)
// stops working.
export const onRequestPost: PagesFunction<Env> = async ({ env, params, request }) => {
  const id = String(params.id || "");
  const rec = await getRecommendationForApplication(env, id);
  if (!rec) return json({ ok: false, error: "This application has no recommendation request." }, 404);
  if (rec.status === "submitted") {
    return json({
      ok: false,
      error: "This teacher has already submitted a recommendation, so the teacher can't be changed here.",
    }, 409);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const teacher_name = String(body.teacher_name ?? "").trim().slice(0, 200);
  const teacher_email = String(body.teacher_email ?? "").trim().slice(0, 320);
  const errors: FieldError[] = [];
  if (!teacher_name) errors.push({ field: "teacher_name", message: "Teacher's name is required." });
  if (!isEmail(teacher_email)) {
    errors.push({ field: "teacher_email", message: "A valid teacher email address is required." });
  }
  if (errors.length) {
    return json({ ok: false, error: errors.map((e) => e.message).join(" "), errors }, 400);
  }

  const changes = diffFields(rec as unknown as Record<string, unknown>, { teacher_name, teacher_email });
  if (!changes.length) return badRequest("Nothing has changed.");

  const emailChanged = rec.teacher_email.trim().toLowerCase() !== teacher_email.toLowerCase();
  if (emailChanged) {
    changes.push({ field: "private_link", before: "Old link", after: "New link (the old one no longer works)" });
  }
  const reason = String(body.reason ?? "").trim().slice(0, 500) || null;

  await env.DB.batch([
    updateRecommendationTeacherStatement(env, rec.id, {
      teacher_name, teacher_email, token: emailChanged ? randomToken() : rec.token,
    }),
    changeLogStatement(env, { application_id: id, entity: "recommendation", entity_id: rec.id, changes, reason }),
  ]);

  return json({ ok: true, link_replaced: emailChanged });
};
