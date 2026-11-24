import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { Button, Card } from "../components/ui.jsx";

export default function Dashboard({ user, flash, onStart }) {
  const [attempts, setAttempts] = useState([]);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    api("/attempts").then((r) => setAttempts(r.attempts)).catch((err) => flash(err.message, "error"));
  }, []);

  const openAttempt = attempts.find((a) => a.paid && !a.completed);
  const finished = attempts.filter((a) => a.completed);

  async function pay() {
    setPaying(true);
    try {
      const { url } = await api("/payments/checkout", { method: "POST" });
      window.location.href = url;
    } catch (err) {
      flash(err.message, "error");
      setPaying(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div>
          <p className="text-sm text-slate-500">Willkommen,</p>
          <h2 className="text-xl font-bold">{user?.full_name || user?.email}</h2>
        </div>
        <ul className="text-sm text-slate-700 space-y-1.5">
          <li>🎤 <b>5 spoken questions</b> (A1 → B2), read aloud in German</li>
          <li>⏱️ <b>10 s</b> preparation + <b>50 s</b> answer per question (5 minutes)</li>
          <li>📊 Scored out of <b>100</b> — pass mark <b>70</b></li>
          <li>💶 <b>€1.00</b> per attempt (secure Stripe payment)</li>
        </ul>

        {openAttempt ? (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 space-y-2">
            <p className="text-sm text-emerald-800 font-medium">✅ You have a paid, unused attempt.</p>
            <Button variant="success" onClick={() => onStart(openAttempt.id)}>Continue to Exam</Button>
          </div>
        ) : (
          <Button onClick={pay} disabled={paying} className="py-3">
            {paying ? "Redirecting to secure payment…" : "Pay €1.00 & Start Test"}
          </Button>
        )}
        <p className="text-xs text-slate-500 text-center">Use a quiet room, a working microphone and a stable internet connection.</p>
      </Card>

      {finished.length > 0 && (
        <Card>
          <h3 className="font-semibold mb-3">Previous results</h3>
          <ul className="divide-y text-sm">
            {finished.map((a) => (
              <li key={a.id} className="py-2 flex justify-between items-center">
                <span>{new Date(a.completed_at || a.created_at).toLocaleString()}</span>
                <span className={`font-semibold ${a.passed ? "text-emerald-700" : "text-red-700"}`}>
                  {a.total_score}/100 · {a.cefr_level || "-"} · {a.passed ? "Passed" : "Not passed"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
