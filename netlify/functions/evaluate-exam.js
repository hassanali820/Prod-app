const {
  supabaseAdmin,
  geminiClient,
  GEMINI_MODEL,
  PASS_MARK,
  MOCK_GEMINI,
  mailer,
  MAIL_FROM,
  json,
  parseBody,
  getUser,
  parseModelJson,
  escapeHtml
} = require("../../lib/common");

const LEVELS = ["A1", "A2", "B1", "B1+", "B2"];
const CEFR = ["Below A1", "A1", "A2", "B1", "B2", "C1"];
const ALLOWED_MIME = ["audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg", "audio/wav", "audio/aac"];
const MAX_CLIP_BASE64 = 4 * 1024 * 1024; // ~3 MB raw per 50 s clip (24 kbps ≈ 150 KB expected)

const clamp25 = (n) => Math.max(0, Math.min(25, Math.round(Number(n) || 0)));

function buildPrompt() {
  return `You are an official German CEFR oral examiner for GerLinx.de.
Evaluate the candidate's 5 spoken German responses below. Each audio clip follows the question it answers.
Questions progress from A1 to B2. Listen to the actual audio carefully; do not invent content.

Score strictly out of 100 total points (${PASS_MARK}/100 is required to PASS):
- grammar_score (0-25): Verb conjugation, cases, word order (Nebensätze), tense accuracy.
- vocabulary_score (0-25): Range, precision, appropriateness for B1/B2 workplace readiness.
- pronunciation_score (0-25): Clarity, German phonetics, word stress, natural fluency.
- sentence_structure_score (0-25): Coherent sentence formation, connectors, completeness of answers.

Each category score reflects ALL 5 answers together. If an audio clip is silent, English-only, or off-topic,
that answer contributes 0 to every category (i.e. each such answer costs up to 1/5 of each category).

For every question provide a verbatim transcript of what the candidate actually said (in the original language;
write "[keine Antwort]" if silent) and short feedback in English.

Return ONLY valid JSON matching this schema:
{
  "grammar_score": number,
  "vocabulary_score": number,
  "pronunciation_score": number,
  "sentence_structure_score": number,
  "total_score": number,
  "cefr_level": "Below A1" | "A1" | "A2" | "B1" | "B2" | "C1",
  "answers": [
    { "question_number": 1, "transcript": string, "on_topic": boolean, "feedback": string }
  ],
  "strengths": [string],
  "improvements": [string],
  "summary": string
}`;
}

function normalizeEvaluation(raw, questions) {
  const grammar = clamp25(raw.grammar_score);
  const vocabulary = clamp25(raw.vocabulary_score);
  const pronunciation = clamp25(raw.pronunciation_score);
  const structure = clamp25(raw.sentence_structure_score);
  const total = grammar + vocabulary + pronunciation + structure; // never trust the model's own sum

  const answers = questions.map((q, i) => {
    const a = (Array.isArray(raw.answers) && raw.answers.find((x) => Number(x?.question_number) === i + 1)) ||
      (Array.isArray(raw.answers) ? raw.answers[i] : null) || {};
    return {
      question_number: i + 1,
      level: LEVELS[i],
      question: q,
      transcript: String(a.transcript || "[keine Antwort]").slice(0, 4000),
      on_topic: a.on_topic !== false,
      feedback: String(a.feedback || "").slice(0, 1500)
    };
  });

  return {
    grammar_score: grammar,
    vocabulary_score: vocabulary,
    pronunciation_score: pronunciation,
    sentence_structure_score: structure,
    total_score: total,
    passed: total >= PASS_MARK,
    cefr_level: CEFR.includes(raw.cefr_level) ? raw.cefr_level : "Below A1",
    answers,
    strengths: (Array.isArray(raw.strengths) ? raw.strengths : []).map(String).slice(0, 6),
    improvements: (Array.isArray(raw.improvements) ? raw.improvements : []).map(String).slice(0, 6),
    summary: String(raw.summary || "").slice(0, 2000),
    model: GEMINI_MODEL
  };
}

function buildEmailHtml(candidate, attempt, ev) {
  const row = (label, value) =>
    `<tr><td style="padding:6px 10px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:600">${escapeHtml(label)}</td>` +
    `<td style="padding:6px 10px;border:1px solid #e2e8f0">${escapeHtml(value)}</td></tr>`;
  const color = ev.passed ? "#15803d" : "#b91c1c";

  const answersHtml = ev.answers
    .map(
      (a) => `
      <div style="margin:14px 0;padding:12px;border:1px solid #e2e8f0;border-radius:8px">
        <div style="font-size:12px;color:#64748b">Frage ${a.question_number} · ${escapeHtml(a.level)}${a.on_topic ? "" : " · <b style='color:#b91c1c'>off-topic / no answer</b>"}</div>
        <div style="font-weight:600;margin:4px 0 8px">${escapeHtml(a.question)}</div>
        <div style="font-size:13px;color:#334155"><b>Transcript:</b> ${escapeHtml(a.transcript)}</div>
        ${a.feedback ? `<div style="font-size:13px;color:#475569;margin-top:6px"><b>Feedback:</b> ${escapeHtml(a.feedback)}</div>` : ""}
      </div>`
    )
    .join("");

  const list = (items) => (items.length ? `<ul>${items.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>` : "<p>—</p>");

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:auto;color:#0f172a">
    <h2 style="margin-bottom:4px">GerLinx Sprachtest — Candidate Report</h2>
    <p style="margin-top:0;color:#64748b">Attempt ${escapeHtml(attempt.id)} · ${escapeHtml(new Date().toISOString())}</p>
    <div style="font-size:28px;font-weight:700;color:${color}">${ev.total_score} / 100 — ${ev.passed ? "PASSED" : "NOT PASSED"}</div>
    <p>CEFR estimate: <b>${escapeHtml(ev.cefr_level)}</b></p>

    <h3>Candidate</h3>
    <table style="border-collapse:collapse;font-size:14px">
      ${row("Full name", candidate.full_name)}
      ${row("Email", candidate.email)}
      ${row("Date of birth", candidate.date_of_birth)}
      ${row("City", candidate.city)}
      ${row("Mobile", candidate.mobile_number)}
    </table>

    <h3>Scorecard</h3>
    <table style="border-collapse:collapse;font-size:14px">
      ${row("Grammar", `${ev.grammar_score} / 25`)}
      ${row("Vocabulary", `${ev.vocabulary_score} / 25`)}
      ${row("Pronunciation", `${ev.pronunciation_score} / 25`)}
      ${row("Sentence structure", `${ev.sentence_structure_score} / 25`)}
      ${row("Total", `${ev.total_score} / 100 (pass mark ${PASS_MARK})`)}
    </table>

    <h3>Summary</h3><p>${escapeHtml(ev.summary || "—")}</p>
    <h3>Strengths</h3>${list(ev.strengths)}
    <h3>Areas to improve</h3>${list(ev.improvements)}
    <h3>Answers &amp; transcripts</h3>${answersHtml}
    <p style="font-size:12px;color:#94a3b8">Reply to this email to contact the candidate directly.</p>
  </div>`;
}

// TEST MODE: no Gemini call. Scores scale with how much audio was recorded per answer
// (Opus compresses silence heavily), so speaking more gives a higher score.
function mockEvaluation(answers) {
  const ratios = answers.map((a) => {
    const bytes = Math.floor(((a?.data || "").length * 3) / 4);
    return Math.max(0, Math.min(1, (bytes - 8000) / 90000));
  });
  const avg = ratios.reduce((s, r) => s + r, 0) / ratios.length;
  const cat = () => clamp25(25 * avg * (0.8 + Math.random() * 0.2));
  const scores = [cat(), cat(), cat(), cat()];
  const total = scores.reduce((s, n) => s + n, 0);
  const cefr = total >= 85 ? "B2" : total >= 70 ? "B1" : total >= 50 ? "A2" : total >= 20 ? "A1" : "Below A1";
  return {
    grammar_score: scores[0],
    vocabulary_score: scores[1],
    pronunciation_score: scores[2],
    sentence_structure_score: scores[3],
    cefr_level: cefr,
    answers: ratios.map((r, i) => ({
      question_number: i + 1,
      transcript: `[TEST MODE — no real transcription. ~${Math.round(r * 100)}% of answer time used]`,
      on_topic: r > 0.05,
      feedback: "Mock feedback. Set MOCK_GEMINI=false and a GEMINI_API_KEY for real AI grading."
    })),
    strengths: ["(test mode) Recording and upload pipeline works"],
    improvements: ["(test mode) Real feedback appears once Gemini is enabled"],
    summary: "TEST MODE: this score is simulated from recording length, not from your German."
  };
}

async function sendAdminEmail(candidate, attempt, ev) {
  const transporter = mailer();
  if (!transporter || !process.env.ADMIN_GMAIL) {
    console.warn("No mail transport or ADMIN_GMAIL configured — skipping admin email.");
    return;
  }
  await transporter.sendMail({
    from: `"GerLinx Sprachtest" <${MAIL_FROM}>`,
    to: process.env.ADMIN_GMAIL,
    replyTo: candidate.email,
    subject: `[Sprachtest] ${candidate.full_name} — ${ev.total_score}/100 ${ev.passed ? "PASSED" : "NOT PASSED"} (${ev.cefr_level})`,
    html: buildEmailHtml(candidate, attempt, ev)
  });
}

exports.handler = async (event) => {
  let lockedAttemptId = null;
  let supabase;

  try {
    supabase = supabaseAdmin();
    const user = await getUser(event);
    if (!user) return json(401, { error: "Please log in again." });

    const { attemptId, answers } = parseBody(event);
    if (!attemptId || !Array.isArray(answers) || answers.length !== 5) {
      return json(400, { error: "Exactly 5 recordings are required." });
    }
    for (const a of answers) {
      if (!a || typeof a.data !== "string" || a.data.length > MAX_CLIP_BASE64) {
        return json(400, { error: "Invalid or oversized recording." });
      }
    }

    // Atomically claim the attempt so a double-submit cannot grade twice.
    const { data: attempt } = await supabase
      .from("exam_attempts")
      .update({ grading_locked: true })
      .eq("id", attemptId)
      .eq("candidate_id", user.id)
      .eq("paid", true)
      .eq("completed", false)
      .eq("grading_locked", false)
      .select("*")
      .maybeSingle();

    if (!attempt) return json(403, { error: "Invalid, already completed, or currently grading attempt." });
    lockedAttemptId = attempt.id;

    if (!Array.isArray(attempt.questions) || attempt.questions.length !== 5) {
      throw Object.assign(new Error("Exam was not started properly."), { status: 400 });
    }

    const { data: candidate } = await supabase
      .from("candidates")
      .select("*")
      .eq("id", user.id)
      .single();

    let rawEvaluation;
    if (MOCK_GEMINI) {
      rawEvaluation = mockEvaluation(answers);
    } else {
      const parts = [{ text: buildPrompt() }];
      attempt.questions.forEach((q, i) => {
        parts.push({ text: `\n--- Frage ${i + 1} (${LEVELS[i]}): ${q}\nCandidate's spoken answer:` });
        const a = answers[i];
        const mime = String(a.mimeType || "").split(";")[0].trim().toLowerCase();
        if (a.data && ALLOWED_MIME.includes(mime)) {
          parts.push({ inlineData: { mimeType: mime, data: a.data } });
        } else {
          parts.push({ text: "[No audio recorded — treat as silent.]" });
        }
      });

      const response = await geminiClient().models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: "user", parts }],
        config: { responseMimeType: "application/json", temperature: 0.2 }
      });
      rawEvaluation = parseModelJson(response.text);
    }

    const evaluation = normalizeEvaluation(rawEvaluation, attempt.questions);
    if (MOCK_GEMINI) evaluation.model = "mock";

    const { error: saveError } = await supabase
      .from("exam_attempts")
      .update({
        completed: true,
        total_score: evaluation.total_score,
        passed: evaluation.passed,
        cefr_estimate: evaluation.cefr_level,
        evaluation_json: evaluation,
        completed_at: new Date().toISOString()
      })
      .eq("id", attempt.id);
    if (saveError) throw saveError;
    lockedAttemptId = null; // completed — keep the lock

    try {
      await sendAdminEmail(candidate, attempt, evaluation);
    } catch (mailErr) {
      // Result is already saved; don't fail the candidate because of SMTP.
      console.error("Admin email failed:", mailErr);
    }

    return json(200, evaluation);
  } catch (err) {
    console.error("evaluate-exam error:", err);
    if (lockedAttemptId) {
      // Release the lock so the candidate can retry the same recordings.
      await supabase.from("exam_attempts").update({ grading_locked: false }).eq("id", lockedAttemptId);
    }
    return json(err.status || 500, {
      error: err.status ? err.message : "Grading failed. Your recordings are kept — please press Retry.",
      retryable: !err.status
    });
  }
};
