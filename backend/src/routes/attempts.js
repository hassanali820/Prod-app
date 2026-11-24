const express = require("express");
const { query } = require("../db");
const { requireAuth } = require("../auth");
const { generateQuestions, gradeAnswers, LEVELS } = require("../services/ai");
const { sendReportEmail } = require("../services/email");

const router = express.Router();
router.use(requireAuth);

const MAX_CLIP_BASE64 = 4 * 1024 * 1024; // 50 s at 24 kbps is ~150 KB, so this is generous

router.get("/", async (req, res) => {
  const { rows } = await query(
    `select id, paid, completed, total_score, passed, cefr_level, created_at, completed_at
     from exam_attempts where user_id = $1 order by created_at desc`,
    [req.userId]
  );
  res.json({ attempts: rows });
});

router.get("/:id", async (req, res) => {
  const { rows } = await query(
    "select id, paid, completed from exam_attempts where id = $1 and user_id = $2",
    [req.params.id, req.userId]
  );
  if (!rows[0]) return res.status(404).json({ error: "Attempt not found." });
  res.json(rows[0]);
});

// Returns the 5 questions. Generated once, so reloading cannot reroll them.
router.post("/:id/start", async (req, res) => {
  const { rows } = await query("select * from exam_attempts where id = $1 and user_id = $2", [req.params.id, req.userId]);
  const attempt = rows[0];
  if (!attempt || !attempt.paid) return res.status(403).json({ error: "Payment not verified." });
  if (attempt.completed) return res.status(400).json({ error: "This attempt was already used." });

  if (Array.isArray(attempt.questions) && attempt.questions.length === 5) {
    return res.json({ questions: attempt.questions, levels: LEVELS });
  }
  const questions = await generateQuestions();
  await query("update exam_attempts set questions = $1, started_at = now() where id = $2", [JSON.stringify(questions), attempt.id]);
  res.json({ questions, levels: LEVELS });
});

router.post("/:id/evaluate", async (req, res) => {
  const { answers } = req.body;
  if (!Array.isArray(answers) || answers.length !== 5) {
    return res.status(400).json({ error: "Exactly 5 recordings are required.", retryable: false });
  }
  if (answers.some((a) => !a || typeof a.data !== "string" || a.data.length > MAX_CLIP_BASE64)) {
    return res.status(400).json({ error: "Invalid or oversized recording.", retryable: false });
  }

  // Lock the attempt atomically so a double submit cannot grade it twice.
  const { rows } = await query(
    `update exam_attempts set grading_locked = true
     where id = $1 and user_id = $2 and paid and not completed and not grading_locked
     returning *`,
    [req.params.id, req.userId]
  );
  const attempt = rows[0];
  if (!attempt) {
    return res.status(403).json({ error: "Invalid, already completed, or currently grading attempt.", retryable: false });
  }
  if (!Array.isArray(attempt.questions) || attempt.questions.length !== 5) {
    await query("update exam_attempts set grading_locked = false where id = $1", [attempt.id]);
    return res.status(400).json({ error: "Exam was not started properly.", retryable: false });
  }

  let evaluation;
  try {
    evaluation = await gradeAnswers(attempt.questions, answers);
    await query(
      `update exam_attempts set completed = true, total_score = $1, passed = $2, cefr_level = $3,
              evaluation = $4, completed_at = now()
       where id = $5`,
      [evaluation.total_score, evaluation.passed, evaluation.cefr_level, JSON.stringify(evaluation), attempt.id]
    );
  } catch (err) {
    console.error("Grading failed:", err);
    await query("update exam_attempts set grading_locked = false where id = $1", [attempt.id]);
    return res.status(500).json({ error: "Grading failed. Your recordings are kept — please press Retry.", retryable: true });
  }

  // The result is already saved, so a mail problem must not fail the request.
  const { rows: users } = await query(
    "select email, full_name, to_char(date_of_birth, 'YYYY-MM-DD') as date_of_birth, city, mobile_number from users where id = $1",
    [req.userId]
  );
  sendReportEmail(users[0], attempt.id, evaluation).catch((err) => console.error("Report email failed:", err.message));

  res.json(evaluation);
});

module.exports = router;
