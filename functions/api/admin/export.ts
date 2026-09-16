import type { Env } from "../../lib/env";
import { listApplicationsFull } from "../../lib/db";
import { listAllChecks, summarizeChecks, formatCents, CHECK_STATUS_LABELS } from "../../lib/checks";
import type { CheckRecord } from "../../lib/checks";
import { SCHOLARSHIP_LABELS } from "../apply";

// CSV export for the board. Gated by the admin session middleware like every
// other /api/admin route.
//   /api/admin/export              every application, plus recommendation and check status
//   /api/admin/export?type=checks  every check, one row each, for reconciling with the bank

const COLUMNS: [string, string][] = [
  ["created_at", "Submitted"],
  ["scholarship", "Scholarship"],
  ["status", "Status"],
  ["score", "Score"],
  ["full_name", "Full Name"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["address", "Address"],
  ["high_school", "High School"],
  ["college", "College"],
  ["date_accepted", "Date Accepted"],
  ["major", "Major"],
  ["parent_names", "Parent/Guardian(s)"],
  ["gpa", "GPA"],
  ["act_sat", "ACT/SAT"],
  ["class_rank", "Class Rank"],
  ["class_size", "Class Size"],
  ["awards", "Awards/Honors"],
  ["activities", "Clubs/Activities"],
  ["teacher_name", "Teacher"],
  ["teacher_email", "Teacher Email"],
  ["rec_status", "Recommendation"],
  ["rec_submitted_at", "Recommendation Received"],
  ["check_state", "Check"],
  ["outstanding", "Outstanding"],
  ["board_notes", "Board Notes"],
];

const CHECK_STATE_LABELS: Record<string, string> = {
  none: "",
  needs_check: "Needs a check",
  outstanding: "Not cashed yet",
  follow_up: "Needs follow-up",
  cleared: "Cashed",
};

const CHECK_COLUMNS = [
  "Student", "Scholarship", "Award Status", "Check #", "Amount", "Payee", "Check Status",
  "Written", "Handed Out", "Cleared (bank date)", "Confirmed On Statement",
  "Replaces Check #", "Replaced By Check #", "Counts Toward Award", "Note",
];

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  // Guard against spreadsheet formula injection.
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function csvResponse(lines: string[], name: string): Response {
  const today = new Date().toISOString().slice(0, 10);
  // ﻿ = UTF-8 BOM so Excel opens the file with correct encoding.
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="andresen-${name}-${today}.csv"`,
    },
  });
}

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const [rows, checks] = await Promise.all([listApplicationsFull(env), listAllChecks(env)]);
  const checksByApp = new Map<string, CheckRecord[]>();
  for (const c of checks) {
    if (!checksByApp.has(c.application_id)) checksByApp.set(c.application_id, []);
    checksByApp.get(c.application_id)!.push(c);
  }

  if (new URL(request.url).searchParams.get("type") === "checks") {
    const lines = [CHECK_COLUMNS.map(csvCell).join(",")];
    for (const app of rows) {
      const appChecks = checksByApp.get(app.id) || [];
      if (!appChecks.length) continue;
      const current = summarizeChecks(app.status, appChecks).current;
      const byId = new Map(appChecks.map((c) => [c.id, c]));
      for (const c of appChecks) {
        const replaces = c.replaces_check_id ? byId.get(c.replaces_check_id) : null;
        const replacedBy = appChecks.find((o) => o.replaces_check_id === c.id);
        lines.push([
          app.full_name,
          SCHOLARSHIP_LABELS[app.scholarship] || app.scholarship,
          app.status,
          c.check_number,
          formatCents(c.amount_cents),
          c.payee,
          CHECK_STATUS_LABELS[c.status] || c.status,
          c.issued_on,
          c.handed_out_on,
          c.cleared_on,
          c.confirmed_on,
          replaces ? replaces.check_number || "(no number)" : "",
          replacedBy ? replacedBy.check_number || "(no number)" : "",
          // Only the current check stands for the award; replaced ones don't add to it.
          current && current.id === c.id ? "Yes" : "No",
          c.note,
        ].map(csvCell).join(","));
      }
    }
    return csvResponse(lines, "checks");
  }

  const lines: string[] = [COLUMNS.map(([, label]) => csvCell(label)).join(",")];
  for (const row of rows) {
    const summary = summarizeChecks(row.status, checksByApp.get(row.id) || []);
    const record: Record<string, unknown> = {
      ...(row as unknown as Record<string, unknown>),
      scholarship: SCHOLARSHIP_LABELS[row.scholarship] || row.scholarship,
      check_state: CHECK_STATE_LABELS[summary.state],
      outstanding: summary.outstanding_cents ? formatCents(summary.outstanding_cents) : "",
    };
    lines.push(COLUMNS.map(([key]) => csvCell(record[key])).join(","));
  }
  return csvResponse(lines, "applications");
};
