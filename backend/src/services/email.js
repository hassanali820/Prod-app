// Sends mail through Gmail (App Password). Without Gmail settings, mails are printed to the log instead.
const nodemailer = require("nodemailer");
const config = require("../config");

const transporter =
  config.gmailUser && config.gmailAppPassword
    ? nodemailer.createTransport({ service: "gmail", auth: { user: config.gmailUser, pass: config.gmailAppPassword } })
    : null;

async function sendMail({ to, subject, html, replyTo }) {
  if (!transporter || !to) {
    console.log(`[email not sent — Gmail not configured] To: ${to || "(no ADMIN_EMAIL)"} | Subject: ${subject}`);
    return;
  }
  await transporter.sendMail({ from: `"GerLinx Sprachtest" <${config.gmailUser}>`, to, subject, html, replyTo });
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function reportHtml(user, attemptId, ev) {
  const row = (label, value) =>
    `<tr><td style="padding:6px 10px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:600">${esc(label)}</td>` +
    `<td style="padding:6px 10px;border:1px solid #e2e8f0">${esc(value)}</td></tr>`;
  const list = (items) => (items.length ? `<ul>${items.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : "<p>—</p>");
  const answers = ev.answers
    .map(
      (a) => `<div style="margin:14px 0;padding:12px;border:1px solid #e2e8f0;border-radius:8px">
        <div style="font-size:12px;color:#64748b">Frage ${a.question_number} · ${esc(a.level)}${a.on_topic ? "" : " · <b style='color:#b91c1c'>off-topic / no answer</b>"}</div>
        <div style="font-weight:600;margin:4px 0 8px">${esc(a.question)}</div>
        <div style="font-size:13px"><b>Transcript:</b> ${esc(a.transcript)}</div>
        ${a.feedback ? `<div style="font-size:13px;color:#475569;margin-top:6px"><b>Feedback:</b> ${esc(a.feedback)}</div>` : ""}
      </div>`
    )
    .join("");

  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:auto;color:#0f172a">
    <h2 style="margin-bottom:4px">GerLinx Sprachtest — Candidate Report</h2>
    <p style="margin-top:0;color:#64748b">Attempt ${esc(attemptId)} · ${esc(new Date().toISOString())}</p>
    <div style="font-size:28px;font-weight:700;color:${ev.passed ? "#15803d" : "#b91c1c"}">${ev.total_score} / 100 — ${ev.passed ? "PASSED" : "NOT PASSED"}</div>
    <p>CEFR estimate: <b>${esc(ev.cefr_level)}</b></p>
    <h3>Candidate</h3>
    <table style="border-collapse:collapse;font-size:14px">
      ${row("Full name", user.full_name)}${row("Email", user.email)}${row("Date of birth", user.date_of_birth)}
      ${row("City", user.city)}${row("Mobile", user.mobile_number)}
    </table>
    <h3>Scorecard</h3>
    <table style="border-collapse:collapse;font-size:14px">
      ${row("Grammar", `${ev.grammar_score} / 25`)}${row("Vocabulary", `${ev.vocabulary_score} / 25`)}
      ${row("Pronunciation", `${ev.pronunciation_score} / 25`)}${row("Sentence structure", `${ev.sentence_structure_score} / 25`)}
      ${row("Total", `${ev.total_score} / 100 (pass mark ${config.passMark})`)}
    </table>
    <h3>Summary</h3><p>${esc(ev.summary || "—")}</p>
    <h3>Strengths</h3>${list(ev.strengths)}
    <h3>Areas to improve</h3>${list(ev.improvements)}
    <h3>Answers &amp; transcripts</h3>${answers}
    <p style="font-size:12px;color:#94a3b8">Reply to this email to contact the candidate directly.</p>
  </div>`;
}

function sendReportEmail(user, attemptId, ev) {
  return sendMail({
    to: config.adminEmail,
    replyTo: user.email,
    subject: `[Sprachtest] ${user.full_name} — ${ev.total_score}/100 ${ev.passed ? "PASSED" : "NOT PASSED"} (${ev.cefr_level})`,
    html: reportHtml(user, attemptId, ev)
  });
}

function sendResetEmail(email, link) {
  if (!transporter) console.log(`[password reset link for ${email}] ${link}`);
  return sendMail({
    to: email,
    subject: "GerLinx Sprachtest — reset your password",
    html: `<p>Click the link below to set a new password (valid for 1 hour):</p><p><a href="${esc(link)}">${esc(link)}</a></p>
           <p>If you did not request this, you can ignore this email.</p>`
  });
}

module.exports = { sendReportEmail, sendResetEmail };
