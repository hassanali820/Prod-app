// Runs the 5 questions: read aloud → 10 s preparation → 50 s recording.
import { useEffect, useRef, useState } from "react";
import { ANSWER_SECONDS, LEVELS, PREP_SECONDS, record, speak, stopSpeaking } from "../lib/audio.js";
import { Button, Card } from "../components/ui.jsx";

export default function Exam({ questions, micStream, onFinished }) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState("reading"); // reading | prep | recording
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [progress, setProgress] = useState(0);
  const endPhaseEarly = useRef(null); // set while a countdown runs

  useEffect(() => {
    let cancelled = false;
    let wakeLock;

    // Resolves when the time is up, the user ends the phase early, or the exam is left.
    const countdown = (seconds) =>
      new Promise((resolve) => {
        const start = performance.now();
        let timer;
        const finish = () => {
          clearInterval(timer);
          endPhaseEarly.current = null;
          resolve();
        };
        const tick = () => {
          const elapsed = (performance.now() - start) / 1000;
          setSecondsLeft(Math.ceil(Math.max(0, seconds - elapsed)));
          setProgress(Math.min(100, (elapsed / seconds) * 100));
          if (elapsed >= seconds || cancelled) finish();
        };
        timer = setInterval(tick, 200);
        tick();
        endPhaseEarly.current = finish;
      });

    (async () => {
      try { wakeLock = await navigator.wakeLock?.request("screen"); } catch { /* optional */ }
      const answers = [];
      for (let i = 0; i < questions.length; i++) {
        setIndex(i);
        setPhase("reading");
        setSecondsLeft(null);
        setProgress(0);
        await speak(questions[i]);
        if (cancelled) return;

        setPhase("prep");
        await countdown(PREP_SECONDS);
        stopSpeaking(); // don't record the TTS voice
        if (cancelled) return;

        setPhase("recording");
        answers.push(await record(micStream, countdown(ANSWER_SECONDS)));
        if (cancelled) return;
      }
      try { await wakeLock?.release(); } catch { /* ignore */ }
      onFinished(answers);
    })();

    return () => {
      cancelled = true;
      stopSpeaking();
      endPhaseEarly.current?.();
      wakeLock?.release().catch(() => {});
    };
  }, []);

  const labels = {
    reading: "🔊 Frage wird vorgelesen…",
    prep: "Preparation time",
    recording: "🎙️ Recording — answer in German"
  };

  return (
    <Card className="space-y-5">
      <div className="flex justify-between items-center">
        <span className="text-sm font-semibold text-slate-600">Frage {index + 1} / 5</span>
        <span className="text-xs font-bold bg-amber-100 text-amber-800 px-2 py-1 rounded">{LEVELS[index]}</span>
      </div>
      <div className="flex gap-1">
        {questions.map((_, i) => (
          <div key={i} className={`h-1.5 flex-1 rounded-full ${i < index ? "bg-emerald-500" : i === index ? "bg-amber-500" : "bg-slate-200"}`} />
        ))}
      </div>
      <p className="text-lg sm:text-xl font-semibold leading-snug min-h-[4rem]">{questions[index]}</p>

      <div className="text-center space-y-2">
        <p className="text-sm font-medium text-slate-500">{labels[phase]}</p>
        <div className="flex items-center justify-center gap-2">
          {phase === "recording" && <span className="rec-dot w-3 h-3 rounded-full bg-red-600" />}
          <span className="text-5xl font-bold tabular-nums">{secondsLeft ?? "--"}</span>
        </div>
        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
          <div className={`h-full ${phase === "recording" ? "bg-red-500" : "bg-amber-500"}`} style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="flex gap-2">
        {phase === "prep" && (
          <>
            <Button variant="outline" className="text-sm" onClick={() => speak(questions[index])}>🔊 Repeat question</Button>
            <Button variant="dark" className="text-sm" onClick={() => endPhaseEarly.current?.()}>Start answering now</Button>
          </>
        )}
        {phase === "recording" && (
          <Button variant="danger" className="text-sm" onClick={() => endPhaseEarly.current?.()}>Finish answer ▶</Button>
        )}
      </div>
    </Card>
  );
}
