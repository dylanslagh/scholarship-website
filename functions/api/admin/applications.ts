import type { Env } from "../../lib/env";
import { json } from "../../lib/env";
import { listApplications, phoneKey, seasonOf } from "../../lib/db";
import { listAllChecks, summarizeChecks, CHECK_STATUS_LABELS } from "../../lib/checks";
import type { CheckRecord } from "../../lib/checks";

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const [items, checks] = await Promise.all([listApplications(env), listAllChecks(env)]);

  const checksByApp = new Map<string, CheckRecord[]>();
  for (const c of checks) {
    if (!checksByApp.has(c.application_id)) checksByApp.set(c.application_id, []);
    checksByApp.get(c.application_id)!.push(c);
  }

  // Applications from one season sharing a phone number. The whole group stays
  // flagged until the board confirms they're different students, so a third
  // application arriving later re-raises it for everyone.
  const phoneGroups = new Map<string, typeof items>();
  for (const a of items) {
    const key = phoneKey(a.phone);
    if (!key) continue;
    const groupKey = `${seasonOf(a.created_at)}:${key}`;
    if (!phoneGroups.has(groupKey)) phoneGroups.set(groupKey, []);
    phoneGroups.get(groupKey)!.push(a);
  }

  const applications = items.map((a) => {
    const summary = summarizeChecks(a.status, checksByApp.get(a.id) || []);
    const key = phoneKey(a.phone);
    const group = key ? phoneGroups.get(`${seasonOf(a.created_at)}:${key}`) || [] : [];
    return {
      ...a,
      shared_phone: group.length > 1 && group.some((g) => !g.phone_reviewed_at),
      check_state: summary.state,
      check_status_label: summary.current ? CHECK_STATUS_LABELS[summary.current.status] : null,
      outstanding_cents: summary.outstanding_cents,
    };
  });

  return json({ ok: true, applications });
};
