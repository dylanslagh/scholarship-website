import type { Env } from "../../lib/env";
import { json } from "../../lib/env";
import { clearCookie } from "../../lib/auth";

export const onRequestPost: PagesFunction<Env> = async () => {
  return json({ ok: true }, 200, { "set-cookie": clearCookie() });
};
