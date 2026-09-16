import type { Env } from "../../lib/env";
import { json, badRequest } from "../../lib/env";
import {
  getRecommendationByToken,
  getApplicationById,
  markRecommendationSubmitted,
} from "../../lib/db";
import { putUpload, validateFile } from "../../lib/storage";
import { emailBoardRecommendationReceived, emailApplicantRecommendationReceived } from "../../lib/email";
import { SCHOLARSHIP_LABELS } from "../apply";

function asFile(v: File | string | null): File | null {
  if (v && typeof v !== "string" && typeof (v as File).arrayBuffer === "function") {
    return v as File;
  }
  return null;
}

// GET: return context for the teacher's page (applicant name, scholarship, status).
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const token = String(context.params.token || "");
  const rec = await getRecommendationByToken(context.env, token);
  if (!rec) return json({ ok: false, error: "This recommendation link is invalid." }, 404);

  const app = await getApplicationById(context.env, rec.application_id);
  return json({
    ok: true,
    applicant_name: app?.full_name || "the applicant",
    scholarship_label: app ? SCHOLARSHIP_LABELS[app.scholarship] || "Andresen Scholarship" : "Andresen Scholarship",
    teacher_name: rec.teacher_name,
    status: rec.status, // 'pending' | 'submitted'
  });
};

// POST: accept the recommendation (file and/or text), mark submitted, notify board.
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, request, waitUntil } = context;
  const token = String(context.params.token || "");

  const rec = await getRecommendationByToken(env, token);
  if (!rec) return json({ ok: false, error: "This recommendation link is invalid." }, 404);
  if (rec.status === "submitted") {
    return json({ ok: false, error: "A recommendation has already been submitted for this student." }, 409);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest("Could not read the submitted form.");
  }

  const text = String(form.get("rec_text") || "").trim();
  const file = asFile(form.get("rec_file"));

  if (!text && (!file || file.size === 0)) {
    return badRequest("Please write a recommendation or attach a file.");
  }

  let fileKey: string | null = null;
  if (file && file.size > 0) {
    const err = validateFile(file);
    if (err) return badRequest(err);
    fileKey = (await putUpload(env, rec.application_id, "recommendation", file)).key;
  }

  // Conditional on still being pending, so a double-click or a retry can't record
  // it twice or send the applicant a second confirmation.
  const recorded = await markRecommendationSubmitted(env, token, fileKey, text || null);
  if (!recorded) {
    return json({ ok: false, error: "A recommendation has already been submitted for this student." }, 409);
  }

  const app = await getApplicationById(env, rec.application_id);
  const adminLink = `${env.APP_BASE_URL}/admin.html`;
  waitUntil(
    Promise.all([
      emailBoardRecommendationReceived(
        env, rec.application_id, app?.full_name || "an applicant", rec.teacher_name, adminLink
      ),
      app
        ? emailApplicantRecommendationReceived(
            env, app.id, app.email, app.full_name,
            SCHOLARSHIP_LABELS[app.scholarship] || "Andresen Scholarship", rec.teacher_name
          )
        : Promise.resolve(null),
    ]).catch((e) => console.error("Recommendation notices failed", e))
  );

  return json({ ok: true });
};
