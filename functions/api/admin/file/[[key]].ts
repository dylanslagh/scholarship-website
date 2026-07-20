import type { Env } from "../../../lib/env";

// Streams an uploaded file from R2. Catch-all so keys with slashes
// (applications/{id}/transcript-...) are captured. Gated by the admin middleware.
export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const raw = params.key;
  const key = Array.isArray(raw) ? raw.map(decodeURIComponent).join("/") : decodeURIComponent(String(raw || ""));
  if (!key.startsWith("applications/")) {
    return new Response("Not found", { status: 404 });
  }

  const obj = await env.UPLOADS.get(key);
  if (!obj) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", "private, no-store");
  return new Response(obj.body, { headers });
};
