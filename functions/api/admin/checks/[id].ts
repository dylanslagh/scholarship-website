import type { Env } from "../../../lib/env";
import { json, badRequest } from "../../../lib/env";
import { changeLogStatement, diffFields } from "../../../lib/db";
import {
  getCheck,
  listChecksForApplication,
  updateCheckStatement,
  parseCheckInput,
  checkFieldsForLog,
  replacementProblem,
} from "../../../lib/checks";

// PATCH: correct or update a check — a new status, a date, a fixed typo. The
// before/after values go to change_log, so an accidental "cashed" can be undone
// without losing the record that it was once entered.
export const onRequestPatch: PagesFunction<Env> = async ({ env, params, request }) => {
  const id = String(params.id || "");
  const check = await getCheck(env, id);
  if (!check) return json({ ok: false, error: "Check not found." }, 404);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const parsed = parseCheckInput(body);
  if (!parsed.ok) {
    return json({ ok: false, error: parsed.errors.map((e) => e.message).join(" "), errors: parsed.errors }, 400);
  }

  const all = await listChecksForApplication(env, check.application_id);
  const problem = replacementProblem(id, parsed.fields.replaces_check_id, all);
  if (problem) {
    return json({ ok: false, error: problem, errors: [{ field: "replaces_check_id", message: problem }] }, 400);
  }

  const changes = diffFields(checkFieldsForLog(check, all), checkFieldsForLog(parsed.fields, all));
  if (!changes.length) return badRequest("Nothing has changed.");
  const reason = String(body.reason ?? "").trim().slice(0, 500) || null;

  await env.DB.batch([
    updateCheckStatement(env, id, parsed.fields),
    changeLogStatement(env, {
      application_id: check.application_id, entity: "check", entity_id: id, changes, reason,
    }),
  ]);

  return json({ ok: true });
};

// DELETE: remove a check entered by mistake (for example, on the wrong student).
// Its last values stay in the change history. A check that another check
// replaces can't be deleted, or the replacement would point at nothing.
export const onRequestDelete: PagesFunction<Env> = async ({ env, params, request }) => {
  const id = String(params.id || "");
  const check = await getCheck(env, id);
  if (!check) return json({ ok: false, error: "Check not found." }, 404);

  const all = await listChecksForApplication(env, check.application_id);
  if (all.some((c) => c.replaces_check_id === id)) {
    return json({
      ok: false,
      error: "Another check is recorded as this one's replacement, so it can't be deleted. Mark it voided instead.",
    }, 409);
  }

  let reason: string | null = null;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    reason = String(body.reason ?? "").trim().slice(0, 500) || null;
  } catch { /* no body is fine */ }

  const before = checkFieldsForLog(check, all);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM checks WHERE id = ?").bind(id),
    changeLogStatement(env, {
      application_id: check.application_id,
      entity: "check",
      entity_id: id,
      changes: [
        ...diffFields(before, Object.fromEntries(Object.keys(before).map((k) => [k, null]))),
        { field: "deleted", before: null, after: "Deleted" },
      ],
      reason,
    }),
  ]);

  return json({ ok: true });
};
