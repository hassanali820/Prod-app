// Question generation and grading with Gemini. MOCK_GEMINI=true works without an API key.
const config = require("../config");

const LEVELS = ["A1", "A2", "B1", "B1+", "B2"];
const CEFR = ["Below A1", "A1", "A2", "B1", "B2", "C1"];
const ALLOWED_MIME = ["audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg", "audio/wav", "audio/aac"];

let client;
function gemini() {
  if (!client) {
    const { GoogleGenAI } = require("@google/genai");
    client = new GoogleGenAI({ apiKey: config.geminiApiKey });
  }
  return client;
}

// Gemini sometimes wraps JSON in ```json fences even in JSON mode.
const parseJson = (text) =>
  JSON.parse(String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, ""));

const clamp25 = (n) => Math.max(0, Math.min(25, Math.round(Number(n) || 0)));

// ------------------------------------------------------------------ questions

// Used in mock mode, or if Gemini fails.
const QUESTION_BANK = [
  [
    "Stellen Sie sich bitte kurz vor: Wie heißen Sie, woher kommen Sie und wo wohnen Sie?",
    "Erzählen Sie bitte von Ihrer Familie und wie ein normaler Tag bei Ihnen aussieht.",
    "Wer sind Sie? Erzählen Sie etwas über Ihre Herkunft, Ihre Sprachen und Ihren Alltag."
  ],
  [
    "Was haben Sie gelernt oder studiert, und was hat Ihnen dabei am besten gefallen?",
    "Was machen Sie gern in Ihrer Freizeit? Erzählen Sie von Ihrem letzten Wochenende.",
    "Erzählen Sie von einer Reise oder einem besonderen Erlebnis aus Ihrer Vergangenheit."
  ],
  [
    "Warum möchten Sie in Deutschland arbeiten oder eine Ausbildung machen?",
    "Welche beruflichen Ziele haben Sie für die nächsten fünf Jahre und warum?",
    "Was erwarten Sie vom Leben in Deutschland und wie bereiten Sie sich darauf vor?"
  ],
  [
    "Sie kommen zu spät zur Arbeit, weil der Bus ausgefallen ist. Was sagen Sie Ihrem Chef und was tun Sie?",
    "Ein Kollege versteht Ihre Anweisung nicht und macht einen Fehler. Wie lösen Sie die Situation?",
    "Ihre Wohnung hat seit zwei Tagen keine Heizung. Was machen Sie und mit wem sprechen Sie?"
  ],
  [
    "Sollte man lieber in einer großen Stadt oder auf dem Land leben? Begründen Sie Ihre Meinung.",
    "Ist Homeoffice besser als die Arbeit im Büro? Nennen Sie Vor- und Nachteile und Ihre Meinung.",
    "Sollten soziale Medien für Jugendliche eingeschränkt werden? Begründen Sie Ihre Meinung."
  ]
];

const randomFromBank = () => QUESTION_BANK.map((set) => set[Math.floor(Math.random() * set.length)]);

async function generateQuestions() {
  if (config.mockGemini) return randomFromBank();
  try {
    const prompt = `Generate 5 unique, random oral examination questions in German for a candidate applying for Ausbildung or work in Germany.
- Question 1 (A1): Personal introduction, origin, daily life.
- Question 2 (A2): Education, hobbies, or past experience.
- Question 3 (B1): Motivation to live/work in Germany or career goals.
- Question 4 (B1+): Practical workplace or everyday problem-solving scenario.
- Question 5 (B2): Expressing and justifying an opinion on a general topic.
Keep each question clear, natural, addressed formally with "Sie", and answerable in 45 seconds.
Vary topics so that two candidates rarely get the same questions. Random seed: ${Math.random().toString(36).slice(2)}
Return ONLY a valid JSON array of 5 strings.`;
    const response = await gemini().models.generateContent({
      model: config.geminiModel,
      contents: prompt,
      config: { responseMimeType: "application/json", temperature: 1.0 }
    });
    const questions = parseJson(response.text);
    const valid = Array.isArray(questions) && questions.length === 5 &&
      questions.every((q) => typeof q === "string" && q.trim().length > 5 && q.length < 400);
    if (!valid) throw new Error("Invalid question format");
    return questions.map((q) => q.trim());
  } catch (err) {
    console.error("Gemini question generation failed, using question bank:", err.message);
    return randomFromBank();
  }
}

// ------------------------------------------------------------------ grading

const GRADING_PROMPT = `You are an official German CEFR oral examiner for GerLinx.de.
Evaluate the candidate's 5 spoken German responses below. Each audio clip follows the question it answers.
Questions progress from A1 to B2. Listen to the actual audio carefully; do not invent content.

Score strictly out of 100 total points (${config.passMark}/100 is required to PASS):
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
  "cefr_level": "Below A1" | "A1" | "A2" | "B1" | "B2" | "C1",
  "answers": [{ "question_number": 1, "transcript": string, "on_topic": boolean, "feedback": string }],
  "strengths": [string],
  "improvements": [string],
  "summary": string
}`;

async function geminiGrade(questions, answers) {
  const parts = [{ text: GRADING_PROMPT }];
  questions.forEach((q, i) => {
    parts.push({ text: `\n--- Frage ${i + 1} (${LEVELS[i]}): ${q}\nCandidate's spoken answer:` });
    const mime = String(answers[i].mimeType || "").split(";")[0].trim().toLowerCase();
    if (answers[i].data && ALLOWED_MIME.includes(mime)) {
      parts.push({ inlineData: { mimeType: mime, data: answers[i].data } });
    } else {
      parts.push({ text: "[No audio recorded — treat as silent.]" });
    }
  });
  const response = await gemini().models.generateContent({
    model: config.geminiModel,
    contents: [{ role: "user", parts }],
    config: { responseMimeType: "application/json", temperature: 0.2 }
  });
  return parseJson(response.text);
}

// Test mode: the score scales with how much audio was recorded (Opus compresses silence heavily).
function mockGrade(answers) {
  const ratios = answers.map((a) => {
    const bytes = Math.floor(((a.data || "").length * 3) / 4);
    return Math.max(0, Math.min(1, (bytes - 8000) / 90000));
  });
  const avg = ratios.reduce((s, r) => s + r, 0) / ratios.length;
  const score = () => clamp25(25 * avg * (0.8 + Math.random() * 0.2));
  const [g, v, p, s] = [score(), score(), score(), score()];
  const total = g + v + p + s;
  return {
    grammar_score: g,
    vocabulary_score: v,
    pronunciation_score: p,
    sentence_structure_score: s,
    cefr_level: total >= 85 ? "B2" : total >= 70 ? "B1" : total >= 50 ? "A2" : total >= 20 ? "A1" : "Below A1",
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

// Never trust the model's own sum: clamp every category and compute total + pass on the server.
function normalize(raw, questions) {
  const scores = {
    grammar_score: clamp25(raw.grammar_score),
    vocabulary_score: clamp25(raw.vocabulary_score),
    pronunciation_score: clamp25(raw.pronunciation_score),
    sentence_structure_score: clamp25(raw.sentence_structure_score)
  };
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const rawAnswers = Array.isArray(raw.answers) ? raw.answers : [];
  const list = (items) => (Array.isArray(items) ? items : []).map(String).slice(0, 6);

  return {
    ...scores,
    total_score: total,
    passed: total >= config.passMark,
    cefr_level: CEFR.includes(raw.cefr_level) ? raw.cefr_level : "Below A1",
    answers: questions.map((question, i) => {
      const a = rawAnswers.find((x) => Number(x?.question_number) === i + 1) || rawAnswers[i] || {};
      return {
        question_number: i + 1,
        level: LEVELS[i],
        question,
        transcript: String(a.transcript || "[keine Antwort]").slice(0, 4000),
        on_topic: a.on_topic !== false,
        feedback: String(a.feedback || "").slice(0, 1500)
      };
    }),
    strengths: list(raw.strengths),
    improvements: list(raw.improvements),
    summary: String(raw.summary || "").slice(0, 2000),
    model: config.mockGemini ? "mock" : config.geminiModel
  };
}

async function gradeAnswers(questions, answers) {
  const raw = config.mockGemini ? mockGrade(answers) : await geminiGrade(questions, answers);
  return normalize(raw, questions);
}

module.exports = { LEVELS, generateQuestions, gradeAnswers };
