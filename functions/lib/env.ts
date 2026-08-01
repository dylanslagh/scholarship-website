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
  CONTACT_EMAIL: string; // public address shown on the site + Reply-To on emails
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

// Start of the current application season, as an ISO timestamp.
//
// Used to scope the one-application-per-student check: a student blocked by
// their own 2027 application must still be able to apply in a later season, and
// a younger sibling reusing the family phone number in 2028 must not be blocked
// by a row from 2027. Derived from DEADLINE (e.g. "Saturday, March 13, 2027"),
// with the season taken to open the previous July.
export function seasonStartISO(env: Env): string {
  const year = Number(/(\d{4})/.exec(env.DEADLINE || "")?.[1]);
  if (!year) {
    // No parseable deadline — fall back to a rolling year.
    return new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  }
  return `${year - 1}-07-01T00:00:00.000Z`;
}

// The address applicants and teachers are told to write to. Kept in [vars] so it
// matches what the pages show; the literal is a last resort if the var is missing,
// because an email with no way to reply is worse than a hardcoded default.
export function contactEmail(env: Env): string {
  return (env.CONTACT_EMAIL || "").trim() || "scholarships@andresen-scholarships.org";
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

// `field` names the form control at fault, when there is one, so the browser can
// highlight and focus it rather than only printing the message.
export function badRequest(message: string, field?: string): Response {
  return json({ ok: false, error: message, ...(field ? { field } : {}) }, 400);
}
