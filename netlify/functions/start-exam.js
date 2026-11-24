const {
  supabaseAdmin,
  geminiClient,
  GEMINI_MODEL,
  MOCK_GEMINI,
  json,
  parseBody,
  getUser,
  parseModelJson
} = require("../../lib/common");

const LEVELS = ["A1", "A2", "B1", "B1+", "B2"];

// Used only if Gemini is unavailable or returns invalid output.
const FALLBACK_BANK = [
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

function fallbackQuestions() {
  return FALLBACK_BANK.map((set) => set[Math.floor(Math.random() * set.length)]);
}

async function generateQuestions() {
  const prompt = `Generate 5 unique, random oral examination questions in German for a candidate applying for Ausbildung or work in Germany.
- Question 1 (A1): Personal introduction, origin, daily life.
- Question 2 (A2): Education, hobbies, or past experience.
- Question 3 (B1): Motivation to live/work in Germany or career goals.
- Question 4 (B1+): Practical workplace or everyday problem-solving scenario.
- Question 5 (B2): Expressing and justifying an opinion on a general topic.
Keep each question clear, natural, addressed formally with "Sie", and answerable in 45 seconds.
Vary topics so that two candidates rarely get the same questions. Random seed: ${Math.random().toString(36).slice(2)}
Return ONLY a valid JSON array of 5 strings, e.g. ["Frage 1...", "Frage 2...", ...]`;

  const response = await geminiClient().models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: { responseMimeType: "application/json", temperature: 1.0 }
  });

  const questions = parseModelJson(response.text);
  if (
    !Array.isArray(questions) ||
    questions.length !== 5 ||
    !questions.every((q) => typeof q === "string" && q.trim().length > 5 && q.length < 400)
  ) {
    throw new Error("Invalid question format from Gemini");
  }
  return questions.map((q) => q.trim());
}

exports.handler = async (event) => {
  try {
    const user = await getUser(event);
    if (!user) return json(401, { error: "Please log in again." });

    const { attemptId } = parseBody(event);
    if (!attemptId) return json(400, { error: "Missing attemptId." });

    const supabase = supabaseAdmin();
    const { data: attempt } = await supabase
      .from("exam_attempts")
      .select("*")
      .eq("id", attemptId)
      .eq("candidate_id", user.id)
      .maybeSingle();

    if (!attempt || !attempt.paid) return json(403, { error: "Payment not verified." });
    if (attempt.completed) return json(400, { error: "This attempt was already used." });

    // Questions are fixed once generated — refreshing the page cannot reroll them.
    if (Array.isArray(attempt.questions) && attempt.questions.length === 5) {
      return json(200, { questions: attempt.questions, levels: LEVELS });
    }

    let questions;
    try {
      if (MOCK_GEMINI) throw new Error("MOCK_GEMINI enabled");
      questions = await generateQuestions();
    } catch (err) {
      console.error("Gemini question generation failed, using fallback bank:", err.message);
      questions = fallbackQuestions();
    }

    await supabase
      .from("exam_attempts")
      .update({ questions, started_at: new Date().toISOString() })
      .eq("id", attemptId);

    return json(200, { questions, levels: LEVELS });
  } catch (err) {
    console.error("start-exam error:", err);
    return json(500, { error: "Could not start the exam. Please try again." });
  }
};
