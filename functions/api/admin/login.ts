import type { Env } from "../../lib/env";
import { json } from "../../lib/env";
import { createSession, sessionCookie, timingSafeEqual } from "../../lib/auth";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
    return json({ ok: false, error: "Admin login is not configured." }, 500);
  }
  let password = "";
  try {
    const body = (await request.json()) as { password?: string };
    password = body.password || "";
  } catch {
    return json({ ok: false, error: "Invalid request." }, 400);
  }
  if (!timingSafeEqual(password, env.ADMIN_PASSWORD)) {
    return json({ ok: false, error: "Incorrect password." }, 401);
  }
  const token = await createSession(env);
  return json({ ok: true }, 200, { "set-cookie": sessionCookie(token) });
};
