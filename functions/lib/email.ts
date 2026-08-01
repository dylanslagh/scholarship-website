import type { Env } from "./env";
import { isDemoMode, boardEmails, contactEmail } from "./env";

interface SendArgs {
  to: string[];
  subject: string;
  html: string;
  replyTo?: string;
}

// Send via Resend, or log to the console when in demo mode / no API key.
export async function sendEmail(env: Env, args: SendArgs): Promise<void> {
  const recipients = args.to.filter(Boolean);
  if (recipients.length === 0) return;

  if (isDemoMode(env)) {
    console.log(
      `\n[DEMO EMAIL] to=${recipients.join(", ")}\n  subject: ${args.subject}\n` +
      `  reply-to: ${args.replyTo || "(none)"}\n` +
      `  (set DEMO_MODE=false and RESEND_API_KEY to send for real)\n`
    );
    return;
  }

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

  if (!resp.ok) {
    const detail = await resp.text();
    // Don't fail the applicant's submission over an email hiccup; log for follow-up.
    console.error(`Resend error ${resp.status}: ${detail}`);
  }
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

// (1) Confirmation to the applicant.
export async function emailApplicantConfirmation(
  env: Env, to: string, name: string, scholarshipLabel: string, teacherName: string
): Promise<void> {
  await sendEmail(env, {
    to: [to],
    replyTo: contactEmail(env),
    subject: "We received your Andresen Scholarship application",
    html: wrap(`
      <p>Hi ${escapeHtml(name)},</p>
      <p>Thank you for applying for the <strong>${escapeHtml(scholarshipLabel)}</strong>. Your application has been received.</p>
      <p>We've emailed <strong>${escapeHtml(teacherName)}</strong> a private link to submit your teacher recommendation. Your application is complete once that recommendation is received — you don't need to do anything further.</p>
      <p>Best of luck,<br>The Andresen Family</p>
      ${contactLine(env)}
    `),
  });
}

// (2) Confidential recommendation request to the teacher.
export async function emailTeacherRequest(
  env: Env, to: string, teacherName: string, applicantName: string, scholarshipLabel: string, link: string
): Promise<void> {
  await sendEmail(env, {
    to: [to],
    replyTo: contactEmail(env),
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
// answer — and never quotes the earlier applicant's contact details back.
export async function emailDuplicateApplication(
  env: Env,
  to: string,
  name: string,
  matchedOn: "email" | "phone",
  existingScholarshipLabel: string,
  existingDate: string
): Promise<void> {
  const matchText = matchedOn === "email"
    ? "this email address"
    : "this phone number";
  const applied = new Date(existingDate).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
  await sendEmail(env, {
    to: [to],
    replyTo: contactEmail(env),
    subject: "You've already applied for an Andresen Scholarship",
    html: wrap(`
      <p>Hi ${escapeHtml(name)},</p>
      <p>We received another application from you, but we weren't able to accept it — an
         application using <strong>${matchText}</strong> was already submitted on
         <strong>${escapeHtml(applied)}</strong> for the
         <strong>${escapeHtml(existingScholarshipLabel)}</strong>.</p>
      <p>Each student may submit <strong>one application</strong>, to <strong>one</strong> of the two
         Andresen scholarships. Your original application still stands and is being reviewed — you
         don't need to do anything else.</p>
      <p>If you think this is a mistake — for example, if a brother or sister applied using the same
         phone number — just reply to this email and we'll sort it out.</p>
      <p>Best of luck,<br>The Andresen Family</p>
      ${contactLine(env)}
    `),
  });
}

// (3) New-application notification to the board.
export async function emailBoardNewApplication(
  env: Env, applicantName: string, scholarshipLabel: string, adminLink: string
): Promise<void> {
  await sendEmail(env, {
    to: boardEmails(env),
    subject: `New application: ${applicantName} (${scholarshipLabel})`,
    html: wrap(`
      <p>A new scholarship application has been submitted.</p>
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
  env: Env, applicantName: string, teacherName: string, adminLink: string
): Promise<void> {
  await sendEmail(env, {
    to: boardEmails(env),
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
