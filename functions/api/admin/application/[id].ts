import type { Env } from "../../../lib/env";
import { json } from "../../../lib/env";
import { getApplicationById, getRecommendationForApplication } from "../../../lib/db";
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
        }
      : null,
  });
};
