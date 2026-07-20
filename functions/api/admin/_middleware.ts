import type { Env } from "../../lib/env";
import { json } from "../../lib/env";
import { readSessionCookie, verifySession } from "../../lib/auth";

// Guards every /api/admin/* route except login/logout with a valid session cookie.
export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  if (url.pathname.endsWith("/login") || url.pathname.endsWith("/logout")) {
    return context.next();
  }
  const token = readSessionCookie(context.request);
  if (!(await verifySession(context.env, token))) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }
  return context.next();
};
