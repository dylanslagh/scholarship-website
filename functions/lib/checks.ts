import type { Env } from "./env";

// Scholarship checks, entered by hand from the family's bank records. Nothing
// here talks to a bank: a status is a note of what the board knows, and marking a
// check lost does not stop payment on it.

export const CHECK_STATUSES = ["issued", "handed_out", "cleared", "lost", "void"] as const;
export type CheckStatus = (typeof CHECK_STATUSES)[number];

export const CHECK_STATUS_LABELS: Record<CheckStatus, string> = {
  issued: "Written, not handed out",
  handed_out: "Handed out",
  cleared: "Cashed (cleared)",
  lost: "Reported lost",
  void: "Voided / stop payment",
};

export interface CheckRecord {
  id: string;
  application_id: string;
  amount_cents: number;
  payee: string | null;
  check_number: string | null;
  status: CheckStatus;
  issued_on: string | null;
  handed_out_on: string | null;
  cleared_on: string | null;
  confirmed_on: string | null;
  replaces_check_id: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

// The fields the board can set, as stored.
export const CHECK_FIELDS = [
  "amount_cents", "payee", "check_number", "status", "issued_on",
  "handed_out_on", "cleared_on", "confirmed_on", "replaces_check_id", "note",
] as const;
export type CheckFields = Pick<CheckRecord, (typeof CHECK_FIELDS)[number]>;

// Where one student's award stands, judged by its current check — the one no
// other check replaces. Replaced checks never add to the outstanding amount, so an
// original and its replacement aren't counted as two awards.
//   none         not awarded, no checks
//   needs_check  awarded, no check recorded yet
//   outstanding  current check written or handed out, not yet cashed
//   follow_up    something needs a person: lost/voided with no replacement, a
//                replaced check not yet voided, two checks both cashed…
//   cleared      current check cashed and nothing else open
export type AwardCheckState = "none" | "needs_check" | "outstanding" | "follow_up" | "cleared";

export interface CheckSummary {
  state: AwardCheckState;
  current: CheckRecord | null;
  outstanding_cents: number; // current check, if written but not cashed or voided
  follow_up: string[]; // plain-language reasons, empty unless state is follow_up
}

function label(check: CheckRecord): string {
  return check.check_number ? `Check #${check.check_number}` : "A check with no number";
}

export function summarizeChecks(appStatus: string, checks: CheckRecord[]): CheckSummary {
  if (!checks.length) {
    return {
      state: appStatus === "awarded" ? "needs_check" : "none",
      current: null, outstanding_cents: 0, follow_up: [],
    };
  }

  const replacedIds = new Set(checks.map((c) => c.replaces_check_id).filter(Boolean));
  const unreplaced = checks
    .filter((c) => !replacedIds.has(c.id))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const current = unreplaced[0] || null;
  const followUp: string[] = [];

  if (current?.status === "lost") {
    followUp.push(`${label(current)} was reported lost and no replacement is recorded.`);
  }
  const cashed = checks.filter((c) => c.status === "cleared");
  // A voided replacement is fine if the original turned up and was cashed after all.
  if (current?.status === "void" && !cashed.length) {
    followUp.push(`${label(current)} was voided and no replacement is recorded.`);
  }
  for (const c of checks) {
    if (!replacedIds.has(c.id)) continue;
    if (c.status === "cleared") {
      // Only safe once every later check in its place has been voided.
      if (current && current.status !== "void" && cashed.length === 1) {
        followUp.push(`${label(c)} was cashed even though it was replaced — void ${label(current).toLowerCase()} with the bank.`);
      }
    } else if (c.status !== "void") {
      followUp.push(`${label(c)} was replaced but isn't marked voided — confirm the stop payment with the bank.`);
    }
  }
  if (cashed.length > 1) {
    followUp.push(`${cashed.length} checks for this award are marked cashed — compare with the bank statement.`);
  }
  const activeUnreplaced = unreplaced.filter((c) => c.status !== "void");
  if (activeUnreplaced.length > 1) {
    followUp.push("More than one check is recorded without saying which one it replaces.");
  }

  const open = !!current && ["issued", "handed_out", "lost"].includes(current.status);
  const outstanding_cents = open && current ? current.amount_cents : 0;

  let state: AwardCheckState;
  if (followUp.length) state = "follow_up";
  else if (cashed.length) state = "cleared";
  else state = "outstanding";

  return { state, current, outstanding_cents, follow_up: followUp };
}

export async function listChecksForApplication(env: Env, applicationId: string): Promise<CheckRecord[]> {
  const { results } = await env.DB.prepare(
    "SELECT * FROM checks WHERE application_id = ? ORDER BY created_at"
  ).bind(applicationId).all<CheckRecord>();
  return results || [];
}

export async function listAllChecks(env: Env): Promise<CheckRecord[]> {
  const { results } = await env.DB.prepare(
    "SELECT * FROM checks ORDER BY created_at"
  ).all<CheckRecord>();
  return results || [];
}

export async function getCheck(env: Env, id: string): Promise<CheckRecord | null> {
  return await env.DB.prepare("SELECT * FROM checks WHERE id = ?").bind(id).first<CheckRecord>();
}

export function insertCheckStatement(env: Env, check: CheckRecord): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO checks (id, application_id, amount_cents, payee, check_number, status, issued_on,
       handed_out_on, cleared_on, confirmed_on, replaces_check_id, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    check.id, check.application_id, check.amount_cents, check.payee, check.check_number,
    check.status, check.issued_on, check.handed_out_on, check.cleared_on, check.confirmed_on,
    check.replaces_check_id, check.note, check.created_at, check.updated_at
  );
}

export function updateCheckStatement(env: Env, id: string, fields: CheckFields): D1PreparedStatement {
  return env.DB.prepare(
    `UPDATE checks SET ${CHECK_FIELDS.map((f) => `${f} = ?`).join(", ")}, updated_at = ? WHERE id = ?`
  ).bind(...CHECK_FIELDS.map((f) => fields[f]), new Date().toISOString(), id);
}

/* ---------- Parsing what the board typed ---------- */

// "1500", "1,500.00" and "$1,500" all mean 150000 cents.
function parseAmount(value: unknown): number | null {
  const s = String(value ?? "").replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const cents = Math.round(parseFloat(s) * 100);
  return cents > 0 && cents <= 100000000 ? cents : null;
}

function parseDate(value: unknown): string | null | undefined {
  const s = String(value ?? "").trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(`${s}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : undefined;
}

function text(value: unknown, max: number): string | null {
  const s = String(value ?? "").trim();
  return s ? s.slice(0, max) : null;
}

export interface CheckFieldError { field: string; message: string; }

// Validate a check form. Every date is optional — older records won't have them,
// and a blank is more honest than a guess.
export function parseCheckInput(
  body: Record<string, unknown>
): { ok: true; fields: CheckFields } | { ok: false; errors: CheckFieldError[] } {
  const errors: CheckFieldError[] = [];

  const amount = parseAmount(body.amount);
  if (amount === null) errors.push({ field: "amount", message: "Enter the amount in dollars, like 1500 or 1,500.00." });

  const status = String(body.status || "issued");
  if (!(CHECK_STATUSES as readonly string[]).includes(status)) {
    errors.push({ field: "status", message: "Choose a status." });
  }

  const dates: Record<string, string | null> = {};
  for (const field of ["issued_on", "handed_out_on", "cleared_on", "confirmed_on"]) {
    const parsed = parseDate(body[field]);
    if (parsed === undefined) errors.push({ field, message: "Use a real date, or leave it blank." });
    else dates[field] = parsed;
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    fields: {
      amount_cents: amount as number,
      payee: text(body.payee, 200),
      check_number: text(body.check_number, 50),
      status: status as CheckStatus,
      issued_on: dates.issued_on,
      handed_out_on: dates.handed_out_on,
      cleared_on: dates.cleared_on,
      confirmed_on: dates.confirmed_on,
      replaces_check_id: text(body.replaces_check_id, 100),
      note: text(body.note, 2000),
    },
  };
}

// Why a check can't be marked as replacing `replacesId`, or null if it can. The
// target must belong to the same student, not already have a replacement, and not
// create a loop (A replaces B replaces A).
export function replacementProblem(
  checkId: string, replacesId: string | null, sameApplication: CheckRecord[]
): string | null {
  if (!replacesId) return null;
  if (replacesId === checkId) return "A check can't replace itself.";
  const target = sameApplication.find((c) => c.id === replacesId);
  if (!target) return "The check being replaced isn't one of this student's checks.";
  if (sameApplication.some((c) => c.replaces_check_id === replacesId && c.id !== checkId)) {
    return "That check already has a replacement recorded.";
  }
  const byId = new Map(sameApplication.map((c) => [c.id, c]));
  let step: CheckRecord | undefined = target;
  for (let i = 0; step && i <= sameApplication.length; i++) {
    if (step.replaces_check_id === checkId) return "That would make two checks replace each other.";
    step = step.replaces_check_id ? byId.get(step.replaces_check_id) : undefined;
  }
  return null;
}

// Readable values for the change history, so it says "$1,500.00" rather than 150000.
export function checkFieldsForLog(fields: CheckFields, allChecks: CheckRecord[]): Record<string, string | null> {
  const replaced = fields.replaces_check_id
    ? allChecks.find((c) => c.id === fields.replaces_check_id)
    : null;
  return {
    amount: formatCents(fields.amount_cents),
    payee: fields.payee,
    check_number: fields.check_number,
    status: CHECK_STATUS_LABELS[fields.status],
    issued_on: fields.issued_on,
    handed_out_on: fields.handed_out_on,
    cleared_on: fields.cleared_on,
    confirmed_on: fields.confirmed_on,
    replaces: replaced ? (replaced.check_number ? `#${replaced.check_number}` : "an unnumbered check") : null,
    note: fields.note,
  };
}

export function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "";
  return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
