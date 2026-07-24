/// <reference types="@cloudflare/workers-types" />

// Bindings and variables available to every Pages Function.
// D1/R2 come from wrangler.toml; the string vars come from [vars] (non-secret)
// or from .dev.vars / the Pages dashboard Secrets (secret).
export interface Env {
  // Bindings
  DB: D1Database;
  UPLOADS: R2Bucket;

  // Non-secret vars (wrangler.toml [vars])
  APP_BASE_URL: string;
  APPLICATIONS_OPEN: string; // "true" | "false"
  DEADLINE: string;
  RESEND_FROM: string;
  DEMO_MODE: string; // "true" => log emails instead of sending

  // Secrets (.dev.vars locally / dashboard in production)
  BOARD_EMAILS?: string; // comma-separated notification recipients
  RESEND_API_KEY?: string;
  ADMIN_PASSWORD?: string;
  SESSION_SECRET?: string;
  TURNSTILE_SECRET?: string;
}

export function applicationsOpen(env: Env): boolean {
  return String(env.APPLICATIONS_OPEN).toLowerCase() === "true";
}

export function isDemoMode(env: Env): boolean {
  // Treat missing Resend key as demo mode too, so we never crash trying to send.
  return String(env.DEMO_MODE).toLowerCase() === "true" || !env.RESEND_API_KEY;
}

export function boardEmails(env: Env): string[] {
  return (env.BOARD_EMAILS || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

// JSON helper responses
export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

export function badRequest(message: string): Response {
  return json({ ok: false, error: message }, 400);
}
