import type { Env } from "../../../../lib/env";
import { json } from "../../../../lib/env";
import {
  getApplicationById,
  findPhoneMatches,
  markPhoneReviewed,
  changeLogStatement,
} from "../../../../lib/db";

// POST: the board confirms that the applications sharing this phone number are
// different students (usually siblings), which clears the flag on all of them.
export const onRequestPost: PagesFunction<Env> = async ({ env, params }) => {
  const id = String(params.id || "");
  const app = await getApplicationById(env, id);
  if (!app) return json({ ok: false, error: "Application not found." }, 404);

  const matches = await findPhoneMatches(env, app);
  if (!matches.length) {
    return json({ ok: false, error: "No other application this season shares this phone number." }, 409);
  }

  const group = [{ id: app.id, full_name: app.full_name }, ...matches];
  await markPhoneReviewed(env, group.map((g) => g.id));
  await env.DB.batch(group.map((member) =>
    changeLogStatement(env, {
      application_id: member.id,
      entity: "application",
      entity_id: member.id,
      changes: [{
        field: "shared_phone",
        before: "Flagged",
        after: "Confirmed different students: " +
          group.filter((g) => g.id !== member.id).map((g) => g.full_name).join(", "),
      }],
      reason: null,
    })
  ));

  return json({ ok: true });
};
