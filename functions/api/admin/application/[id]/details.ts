import type { Env } from "../../../../lib/env";
import { json, badRequest } from "../../../../lib/env";
import {
  getApplicationById,
  findApplicationByEmail,
  updateApplicationDetailsStatement,
  changeLogStatement,
  diffFields,
  seasonOf,
  EDITABLE_APPLICATION_FIELDS,
} from "../../../../lib/db";
import type { EditableApplicationField } from "../../../../lib/db";
import { REQUIRED_FIELDS, isEmail } from "../../../../lib/validation";
import type { FieldError } from "../../../../lib/validation";

// POST: correct an applicant's contact or college details. Saves only — it never
// emails anyone. Each save is logged with before/after values, so what the
// applicant originally submitted is never lost.
export const onRequestPost: PagesFunction<Env> = async ({ env, params, request }) => {
  const id = String(params.id || "");
  const app = await getApplicationById(env, id);
  if (!app) return json({ ok: false, error: "Application not found." }, 404);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }
  const input = (body.fields || {}) as Record<string, unknown>;

  const next: Partial<Record<EditableApplicationField, string | null>> = {};
  const errors: FieldError[] = [];
  for (const field of EDITABLE_APPLICATION_FIELDS) {
    if (input[field] === undefined) continue;
    const value = String(input[field] ?? "").trim();
    if (!value && REQUIRED_FIELDS[field]) {
      errors.push({ field, message: `${REQUIRED_FIELDS[field]} is required.` });
    } else if (value.length > 2000) {
      errors.push({ field, message: "This is too long." });
    }
    next[field] = value || null;
  }
  if (next.email && !isEmail(next.email)) {
    errors.push({ field: "email", message: "A valid email address is required." });
  }
  if (errors.length) {
    return json({ ok: false, error: errors.map((e) => e.message).join(" "), errors }, 400);
  }

  const changes = diffFields(app as unknown as Record<string, unknown>, next);
  if (!changes.length) return badRequest("Nothing has changed.");
  const changed = new Set(changes.map((c) => c.field));

  // The email address is what makes an application one student's, so two
  // applications in a season can't share one — same rule as the public form.
  if (changed.has("email") && next.email) {
    const seasonStart = `${seasonOf(app.created_at) - 1}-07-01T00:00:00.000Z`;
    const other = await findApplicationByEmail(env, next.email, seasonStart, app.id);
    if (other) {
      const message = `${other.full_name}'s application this season already uses this email address.`;
      return json({ ok: false, error: message, errors: [{ field: "email", message }] }, 409);
    }
  }

  const onlyChanged = Object.fromEntries(
    Object.entries(next).filter(([field]) => changed.has(field))
  ) as Partial<Record<EditableApplicationField, string | null>>;
  const reason = String(body.reason ?? "").trim().slice(0, 500) || null;

  const statements = [
    updateApplicationDetailsStatement(env, id, onlyChanged),
    changeLogStatement(env, { application_id: id, entity: "application", entity_id: id, changes, reason }),
  ];
  // A new phone number means any earlier "these are different students" answer
  // was about a different group.
  if (changed.has("phone")) {
    statements.push(env.DB.prepare("UPDATE applications SET phone_reviewed_at = NULL WHERE id = ?").bind(id));
  }
  await env.DB.batch(statements);

  return json({ ok: true, changes });
};
