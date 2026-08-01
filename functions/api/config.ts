import type { Env } from "../lib/env";
import { applicationsOpen, json } from "../lib/env";

// The open/closed state the pages actually trust. `site-config.js` ships a
// static default so the buttons render instantly, but it can only be right for
// one environment at a time — production is closed while preview is open. This
// endpoint reports the same value `POST /api/apply` enforces, per environment,
// so the front end can correct itself instead of drifting.
export const onRequestGet: PagesFunction<Env> = async ({ env }) =>
  json(
    { applicationsOpen: applicationsOpen(env), deadline: env.DEADLINE },
    200,
    { "cache-control": "no-store" }
  );
