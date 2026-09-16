import type { Env } from "./env";
import { isDemoMode, boardEmails, contactEmail } from "./env";
import { insertEmailLog, completeEmailLog } from "./db";

export type EmailKind =
  | "applicant_confirmation"
  | "teacher_request"
  | "duplicate_notice"
  | "board_new_application"
  | "board_recommendation_received"
  | "applicant_recommendation_received";

interface SendArgs {
  to: string[];
  subject: string;
  html: string;
  replyTo?: string;
  kind: EmailKind;
  applicationId: string | null;
  // An email_log row already reserved by reserveEmailSend(), to fill in rather
  // than inserting a second row.
  logId?: string;
}

// 'accepted' means Resend took the message for sending. It is not proof that it
// arrived, and nothing here should say it was delivered or read.
export interface SendResult {
  outcome: "accepted" | "failed" | "logged";
  providerId: string | null;
  error: string | null;
}

// Send via Resend, or log to the console when in demo mode / no API key. Every
// attempt is recorded in email_log. Never throws — an email hiccup must not fail
// the applicant's submission — so callers read the outcome instead.
export async function sendEmail(env: Env, args: SendArgs): Promise<SendResult | null> {
  const recipients = args.to.filter(Boolean);
  if (recipients.length === 0) return null;

  let result: SendResult;
  if (isDemoMode(env)) {
    console.log(
      `\n[DEMO EMAIL] to=${recipients.join(", ")}\n  subject: ${args.subject}\n` +
      `  reply-to: ${args.replyTo || "(none)"}\n` +
      `  (set DEMO_MODE=false and RESEND_API_KEY to send for real)\n`
    );
    result = { outcome: "logged", providerId: null, error: null };
  } else {
    try {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.RESEND_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: env.RESEND_FROM,
          to: recipients,
          subject: args.subject,
          html: args.html,
          ...(args.replyTo ? { reply_to: args.replyTo } : {}),
        }),
      });
      const detail = await resp.text();
      if (resp.ok) {
        let id: string | null = null;
        try { id = (JSON.parse(detail) as { id?: string }).id || null; } catch { /* no id */ }
        result = { outcome: "accepted", providerId: id, error: null };
      } else {
        console.error(`Resend error ${resp.status}: ${detail}`);
        result = { outcome: "failed", providerId: null, error: `Resend ${resp.status}: ${detail.slice(0, 500)}` };
      }
    } catch (e) {
      console.error("Resend request failed", e);
      result = { outcome: "failed", providerId: null, error: String(e).slice(0, 500) };
    }
  }

  const row = {
    recipients: recipients.join(", "),
    subject: args.subject,
    outcome: result.outcome,
    provider_id: result.providerId,
    error: result.error,
  };
  try {
    if (args.logId) {
      await completeEmailLog(env, args.logId, row);
    } else {
      await insertEmailLog(env, {
        id: crypto.randomUUID(),
        application_id: args.applicationId,
        kind: args.kind,
        created_at: new Date().toISOString(),
        ...row,
      });
    }
  } catch (e) {
    console.error("Could not record email in email_log", e);
  }
  return result;
}

// True when a send didn't go wrong. Demo mode counts: nothing failed.
export function sendSucceeded(result: SendResult | null): boolean {
  return !!result && result.outcome !== "failed";
}

const BRAND = "Andresen Memorial Scholarships";

// Every message that leaves the trust for an applicant or teacher says how to
// reach a human, and sets Reply-To so hitting reply does the same thing.
function contactLine(env: Env): string {
  const address = escapeHtml(contactEmail(env));
  return `<p style="font-size:13px;color:#8a9199">Questions? Email us at
    <a href="mailto:${address}">${address}</a>.</p>`;
}

function wrap(bodyHtml: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#41474e;line-height:1.6;max-width:600px">
    <h2 style="color:#2e3538">${BRAND}</h2>
    ${bodyHtml}
    <hr style="border:none;border-top:1px solid #e6e6e6;margin:24px 0">
    <p style="font-size:12px;color:#8a9199">Harold A and Marilyn Kay Andresen Charitable Trust</p>
  </div>`;
}

// (1) Confirmation to the applicant. Sent after the teacher request, so it can say
// honestly whether that request went out.
export async function emailApplicantConfirmation(
  env: Env, applicationId: string, to: string, name: string, scholarshipLabel: string,
  teacherName: string, teacherRequestSent: boolean
): Promise<SendResult | null> {
  const teacherLine = teacherRequestSent
    ? `<p>We've sent <strong>${escapeHtml(teacherName)}</strong> an email with a private link to submit your teacher recommendation. If they can't find it, ask them to check their spam folder, or reply to this email and we'll send it again.</p>`
    : `<p>We weren't able to email <strong>${escapeHtml(teacherName)}</strong> automatically just now. We've been notified and will make sure they get the request, so you don't need to do anything.</p>`;
  return await sendEmail(env, {
    to: [to],
    replyTo: contactEmail(env),
    kind: "applicant_confirmation",
    applicationId,
    subject: "We received your Andresen Scholarship application",
    html: wrap(`
      <p>Hi ${escapeHtml(name)},</p>
      <p>Thank you for applying for the <strong>${escapeHtml(scholarshipLabel)}</strong>. Your application has been received.</p>
      ${teacherLine}
      <p>Your application is complete once that recommendation is received — we'll email you when it arrives.</p>
      <p>Best of luck,<br>The Andresen Family</p>
      ${contactLine(env)}
    `),
  });
}

// (2) Confidential recommendation request to the teacher.
export async function emailTeacherRequest(
  env: Env, applicationId: string, to: string, teacherName: string, applicantName: string,
  scholarshipLabel: string, link: string, logId?: string
): Promise<SendResult | null> {
  return await sendEmail(env, {
    to: [to],
    replyTo: contactEmail(env),
    kind: "teacher_request",
    applicationId,
    logId,
    subject: `Recommendation request for ${applicantName}`,
    html: wrap(`
      <p>Dear ${escapeHtml(teacherName)},</p>
      <p><strong>${escapeHtml(applicantName)}</strong> has listed you as a recommender for the <strong>${escapeHtml(scholarshipLabel)}</strong>.</p>
      <p>Please use the private link below to submit your recommendation confidentially. The applicant will not see what you write.</p>
      <p><a href="${link}" style="display:inline-block;background:#4f5b66;color:#fff;padding:10px 18px;border-radius:5px;text-decoration:none">Submit your recommendation</a></p>
      <p style="font-size:13px;color:#8a9199">Or paste this link into your browser:<br>${escapeHtml(link)}</p>
      <p>Thank you for supporting this student.<br>The Andresen Family</p>
      ${contactLine(env)}
    `),
  });
}

// (2b) Tell an applicant their second application can't be accepted.
// Goes to the address on the *new* submission — that's who is waiting on an
// answer. It's logged against the first application, which shares that address.
export async function emailDuplicateApplication(
  env: Env,
  existingApplicationId: string,
  to: string,
  name: string,
  existingScholarshipLabel: string,
  existingDate: string
): Promise<SendResult | null> {
  const applied = new Date(existingDate).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
  return await sendEmail(env, {
    to: [to],
    replyTo: contactEmail(env),
    kind: "duplicate_notice",
    applicationId: existingApplicationId,
    subject: "You've already applied for an Andresen Scholarship",
    html: wrap(`
      <p>Hi ${escapeHtml(name)},</p>
      <p>We received another application from you, but we weren't able to accept it — an
         application using <strong>this email address</strong> was already submitted on
         <strong>${escapeHtml(applied)}</strong> for the
         <strong>${escapeHtml(existingScholarshipLabel)}</strong>.</p>
      <p>Each student may submit <strong>one application</strong>, to <strong>one</strong> of the two
         Andresen scholarships. Your original application still stands and is being reviewed — you
         don't need to do anything else.</p>
      <p>If you think this is a mistake, just reply to this email and we'll sort it out.</p>
      <p>Best of luck,<br>The Andresen Family</p>
      ${contactLine(env)}
    `),
  });
}

// (2c) Tell the applicant their recommendation arrived. Says who sent it and
// nothing else — never the text, the attachment, or the teacher's link.
export async function emailApplicantRecommendationReceived(
  env: Env, applicationId: string, to: string, name: string, scholarshipLabel: string, teacherName: string
): Promise<SendResult | null> {
  return await sendEmail(env, {
    to: [to],
    replyTo: contactEmail(env),
    kind: "applicant_recommendation_received",
    applicationId,
    subject: "Your teacher recommendation has been received",
    html: wrap(`
      <p>Hi ${escapeHtml(name)},</p>
      <p><strong>${escapeHtml(teacherName)}</strong> has submitted your recommendation for the
         <strong>${escapeHtml(scholarshipLabel)}</strong>. Your application is now complete — there's
         nothing else you need to do.</p>
      <p>Best of luck,<br>The Andresen Family</p>
      ${contactLine(env)}
    `),
  });
}

// (3) New-application notification to the board.
export async function emailBoardNewApplication(
  env: Env, applicationId: string, applicantName: string, scholarshipLabel: string,
  adminLink: string, teacherRequestSent: boolean
): Promise<SendResult | null> {
  const warning = teacherRequestSent
    ? ""
    : `<p style="background:#f9e8e2;color:#a5432e;padding:10px 14px;border-radius:6px">
         <strong>The teacher request email failed to send.</strong> Open the application in the
         dashboard to check the teacher's address and send it again.</p>`;
  return await sendEmail(env, {
    to: boardEmails(env),
    kind: "board_new_application",
    applicationId,
    subject: `New application: ${applicantName} (${scholarshipLabel})`,
    html: wrap(`
      <p>A new scholarship application has been submitted.</p>
      ${warning}
      <ul>
        <li><strong>Applicant:</strong> ${escapeHtml(applicantName)}</li>
        <li><strong>Scholarship:</strong> ${escapeHtml(scholarshipLabel)}</li>
      </ul>
      <p><a href="${adminLink}">Review it in the board dashboard</a></p>
    `),
  });
}

// (3b) Notify the board when a teacher recommendation completes an application.
export async function emailBoardRecommendationReceived(
  env: Env, applicationId: string, applicantName: string, teacherName: string, adminLink: string
): Promise<SendResult | null> {
  return await sendEmail(env, {
    to: boardEmails(env),
    kind: "board_recommendation_received",
    applicationId,
    subject: `Recommendation received: ${applicantName}`,
    html: wrap(`
      <p>A teacher recommendation was submitted, completing an application.</p>
      <ul>
        <li><strong>Applicant:</strong> ${escapeHtml(applicantName)}</li>
        <li><strong>Recommender:</strong> ${escapeHtml(teacherName)}</li>
      </ul>
      <p><a href="${adminLink}">View the full application</a></p>
    `),
  });
}

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
