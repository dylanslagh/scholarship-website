import type { Env } from "../../../../lib/env";
import { json, badRequest } from "../../../../lib/env";
import { getApplicationById, changeLogStatement, diffFields } from "../../../../lib/db";
import {
  listChecksForApplication,
  insertCheckStatement,
  parseCheckInput,
  checkFieldsForLog,
  replacementProblem,
} from "../../../../lib/checks";
import type { CheckRecord } from "../../../../lib/checks";

// POST: record a scholarship check (or a replacement for one) against an application.
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

  const parsed = parseCheckInput(body);
  if (!parsed.ok) {
    return json({ ok: false, error: parsed.errors.map((e) => e.message).join(" "), errors: parsed.errors }, 400);
  }

  const existing = await listChecksForApplication(env, id);
  const newId = crypto.randomUUID();
  const problem = replacementProblem(newId, parsed.fields.replaces_check_id, existing);
  if (problem) {
    return json({ ok: false, error: problem, errors: [{ field: "replaces_check_id", message: problem }] }, 400);
  }

  const now = new Date().toISOString();
  const check: CheckRecord = { id: newId, application_id: id, ...parsed.fields, created_at: now, updated_at: now };
  const reason = String(body.reason ?? "").trim().slice(0, 500) || null;

  await env.DB.batch([
    insertCheckStatement(env, check),
    changeLogStatement(env, {
      application_id: id,
      entity: "check",
      entity_id: newId,
      changes: diffFields({}, checkFieldsForLog(parsed.fields, existing)),
      reason,
    }),
  ]);

  return json({ ok: true, id: newId });
};
