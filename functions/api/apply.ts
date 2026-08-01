import type { Env } from "../lib/env";
import { applicationsOpen, boardEmails, json, badRequest } from "../lib/env";
import { validateApplicationFields, verifyTurnstile } from "../lib/validation";
import { putUpload, putBytes, validateFile, decodeDataUrl } from "../lib/storage";
import { insertApplication, insertRecommendation } from "../lib/db";
import type { ApplicationRecord } from "../lib/db";
import {
  emailApplicantConfirmation,
  emailTeacherRequest,
  emailBoardNewApplication,
} from "../lib/email";

export const SCHOLARSHIP_LABELS: Record<string, string> = {
  ag: "Andresen Ag Scholarship",
  memorial: "Andresen Memorial Scholarship",
};

// Text fields we accept from the form (everything except files + signatures).
const TEXT_FIELDS = [
  "scholarship", "full_name", "phone", "email", "address", "high_school",
  "college", "date_accepted", "major", "parent_names",
  "gpa", "class_rank", "class_size", "act_sat", "awards", "activities",
  "teacher_name", "teacher_email",
];

// FormData values are File | string; duck-type to a File without relying on
// `instanceof File` (not reliable across the Workers type/runtime boundary).
function asFile(v: File | string | null): File | null {
  if (v && typeof v !== "string" && typeof (v as File).arrayBuffer === "function") {
    return v as File;
  }
  return null;
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, waitUntil } = context;

  if (!applicationsOpen(env)) {
    return json({ ok: false, error: "Applications are currently closed." }, 403);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest("Could not read the submitted form.");
  }

  // Collect text fields.
  const fields: Record<string, string> = {};
  for (const key of TEXT_FIELDS) {
    const v = form.get(key);
    if (typeof v === "string") fields[key] = v.trim();
  }

  // Bot check.
  const turnstileToken = String(form.get("cf-turnstile-response") || "");
  const ip = request.headers.get("cf-connecting-ip");
  if (!(await verifyTurnstile(env, turnstileToken, ip))) {
    return badRequest("Bot verification failed. Please try again.");
  }

  // Field validation. `errors` carries a field name per problem so the browser
  // can highlight and focus the first one; `error` stays for older clients.
  const { ok, errors } = validateApplicationFields(fields);
  if (!ok) {
    return json({ ok: false, error: errors.map((e) => e.message).join(" "), errors }, 400);
  }

  // Required files: transcript + essay.
  const transcript = asFile(form.get("transcript"));
  const essay = asFile(form.get("essay"));
  if (!transcript || transcript.size === 0) {
    return badRequest("A high school transcript file is required.", "transcript");
  }
  if (!essay || essay.size === 0) {
    return badRequest("An essay file is required.", "essay");
  }
  for (const [field, label, file] of [
    ["transcript", "Transcript", transcript],
    ["essay", "Essay", essay],
  ] as const) {
    const err = validateFile(file);
    if (err) return badRequest(`${label}: ${err}`, field);
  }

  // Signatures (data URLs from the signature pads). The applicant's is required;
  // the parent/guardian's is optional.
  const applicantSig = decodeDataUrl(String(form.get("applicant_signature") || ""));
  const parentSig = decodeDataUrl(String(form.get("parent_signature") || ""));
  if (!applicantSig) return badRequest("Applicant signature is required.", "applicant_signature");

  const appId = crypto.randomUUID();

  // Store files in R2.
  let transcriptKey: string, essayKey: string, applicantSigKey: string;
  let parentSigKey: string | null = null;
  try {
    transcriptKey = (await putUpload(env, appId, "transcript", transcript)).key;
    essayKey = (await putUpload(env, appId, "essay", essay)).key;
    applicantSigKey = await putBytes(
      env, `applications/${appId}/applicant-signature.png`, applicantSig.bytes, applicantSig.contentType
    );
    if (parentSig) {
      parentSigKey = await putBytes(
        env, `applications/${appId}/parent-signature.png`, parentSig.bytes, parentSig.contentType
      );
    }
  } catch (e) {
    console.error("R2 upload failed", e);
    return json({ ok: false, error: "Upload failed. Please try again." }, 500);
  }

  // Insert the application row.
  const now = new Date().toISOString();
  const record: ApplicationRecord = {
    id: appId,
    scholarship: fields.scholarship,
    status: "submitted",
    created_at: now,
    full_name: fields.full_name,
    phone: fields.phone || null,
    email: fields.email,
    address: fields.address || null,
    high_school: fields.high_school || null,
    college: fields.college || null,
    date_accepted: fields.date_accepted || null,
    major: fields.major || null,
    parent_names: fields.parent_names || null,
    gpa: fields.gpa || null,
    class_rank: fields.class_rank || null,
    class_size: fields.class_size || null,
    act_sat: fields.act_sat || null,
    awards: fields.awards || null,
    activities: fields.activities || null,
    transcript_key: transcriptKey,
    essay_key: essayKey,
    applicant_sig_key: applicantSigKey,
    parent_sig_key: parentSigKey,
  };

  try {
    await insertApplication(env, record);
  } catch (e) {
    console.error("D1 insert failed", e);
    return json({ ok: false, error: "Could not save your application. Please try again." }, 500);
  }

  // Create the pending teacher recommendation with a private token.
  const token = randomToken();
  await insertRecommendation(env, {
    id: crypto.randomUUID(),
    application_id: appId,
    teacher_name: fields.teacher_name,
    teacher_email: fields.teacher_email,
    token,
    status: "pending",
    rec_file_key: null,
    rec_text: null,
    created_at: now,
    submitted_at: null,
  });

  const label = SCHOLARSHIP_LABELS[fields.scholarship] || "Andresen Scholarship";
  const recLink = `${env.APP_BASE_URL}/recommend.html?token=${token}`;
  const adminLink = `${env.APP_BASE_URL}/admin.html`;

  // Send notifications after the response so the applicant isn't kept waiting.
  const notify = Promise.all([
    emailApplicantConfirmation(env, fields.email, fields.full_name, label, fields.teacher_name),
    emailTeacherRequest(env, fields.teacher_email, fields.teacher_name, fields.full_name, label, recLink),
    boardEmails(env).length
      ? emailBoardNewApplication(env, fields.full_name, label, adminLink)
      : Promise.resolve(),
  ]).catch((e) => console.error("Email send failed", e));
  waitUntil(notify);

  return json({ ok: true, id: appId });
};
