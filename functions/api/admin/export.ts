import type { Env } from "../../lib/env";
import { listApplicationsFull } from "../../lib/db";
import { SCHOLARSHIP_LABELS } from "../apply";

// CSV export of every application (plus recommendation status) for the board.
// Gated by the admin session middleware like every other /api/admin route.

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
  ["financing_plan", "Financing Plan"],
  ["work_during_school", "Will Work During School"],
  ["other_scholarships", "Other Scholarships"],
  ["pct_parents", "% Paid by Parents"],
  ["parent_income", "Parent Income"],
  ["num_dependents", "# Dependents"],
  ["dependent_ages", "Dependent Ages"],
  ["parent_occupations", "Parent Occupation(s)"],
  ["teacher_name", "Teacher"],
  ["teacher_email", "Teacher Email"],
  ["rec_status", "Recommendation"],
  ["rec_submitted_at", "Recommendation Received"],
  ["board_notes", "Board Notes"],
];

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  // Guard against spreadsheet formula injection.
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const rows = await listApplicationsFull(env);

  const lines: string[] = [COLUMNS.map(([, label]) => csvCell(label)).join(",")];
  for (const row of rows) {
    const record = row as unknown as Record<string, unknown>;
    lines.push(
      COLUMNS.map(([key]) => {
        let value = record[key];
        if (key === "scholarship") value = SCHOLARSHIP_LABELS[String(value)] || value;
        return csvCell(value);
      }).join(",")
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  // ﻿ = UTF-8 BOM so Excel opens the file with correct encoding.
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="andresen-applications-${today}.csv"`,
    },
  });
};
