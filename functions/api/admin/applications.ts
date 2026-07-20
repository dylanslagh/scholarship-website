import type { Env } from "../../lib/env";
import { json } from "../../lib/env";
import { listApplications } from "../../lib/db";

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const items = await listApplications(env);
  return json({ ok: true, applications: items });
};
