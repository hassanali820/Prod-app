import { Button, Card } from "../components/ui.jsx";

const CATEGORIES = [
  ["Grammar", "grammar_score"],
  ["Vocabulary", "vocabulary_score"],
  ["Pronunciation", "pronunciation_score"],
  ["Sentence structure", "sentence_structure_score"]
];

export default function Result({ result: r, onBack }) {
  return (
    <div className="space-y-4">
      <Card className="text-center space-y-2">
        <p className="text-sm text-slate-500">Your result</p>
        <p className={`text-5xl font-bold ${r.passed ? "text-emerald-600" : "text-red-600"}`}>{r.total_score} / 100</p>
        <p className={`inline-block text-sm font-bold px-3 py-1 rounded-full ${r.passed ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
          {r.passed ? "PASSED ✓" : "NOT PASSED"}
        </p>
        <p className="text-sm text-slate-600">Estimated CEFR level: <b>{r.cefr_level}</b></p>
      </Card>

      <Card className="space-y-3">
        {CATEGORIES.map(([label, key]) => (
          <div key={key}>
            <div className="flex justify-between text-sm mb-1">
              <span>{label}</span>
              <span className="font-semibold">{r[key]} / 25</span>
            </div>
            <div className="h-2.5 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-amber-500" style={{ width: `${(r[key] / 25) * 100}%` }} />
            </div>
          </div>
        ))}
      </Card>

      <Card className="space-y-3 text-sm text-slate-700">
        <h3 className="font-semibold text-slate-900">Feedback</h3>
        <p>{r.summary}</p>
        {[["Strengths", r.strengths], ["To improve", r.improvements]].map(([title, items]) =>
          items?.length ? (
            <div key={title}>
              <p className="font-semibold">{title}</p>
              <ul className="list-disc pl-5">{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </div>
          ) : null
        )}
      </Card>

      <Card className="space-y-3">
        <h3 className="font-semibold">Your answers</h3>
        {r.answers?.map((a) => (
          <div key={a.question_number} className="border rounded-lg p-3 text-sm space-y-1">
            <p className="text-xs text-slate-500">Frage {a.question_number} · {a.level}</p>
            <p className="font-semibold">{a.question}</p>
            <p className="text-slate-700 italic">„{a.transcript}“</p>
            {a.feedback && <p className="text-slate-600">{a.feedback}</p>}
          </div>
        ))}
      </Card>

      <p className="text-xs text-slate-500 text-center">Your report has been sent to the GerLinx team. They will contact you if you passed.</p>
      <Button variant="dark" onClick={onBack}>Back to dashboard</Button>
    </div>
  );
}
