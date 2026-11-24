// Instructions + microphone check, then loads the questions.
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { openMicrophone, unlockSpeech } from "../lib/audio.js";
import { Button, Card } from "../components/ui.jsx";

export default function Precheck({ attemptId, micStream, setMicStream, onReady, onError }) {
  const [micError, setMicError] = useState("");
  const [starting, setStarting] = useState(false);
  const levelRef = useRef(null);

  // Live level meter so the candidate can see the microphone works.
  useEffect(() => {
    if (!micStream) return;
    let ctx, frame;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(micStream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        if (levelRef.current) levelRef.current.style.width = `${Math.min(100, (peak / 64) * 100)}%`;
        frame = requestAnimationFrame(tick);
      };
      tick();
    } catch { /* the meter is optional */ }
    return () => { cancelAnimationFrame(frame); ctx?.close(); };
  }, [micStream]);

  async function allowMic() {
    setMicError("");
    try {
      setMicStream(await openMicrophone());
    } catch (err) {
      setMicError(err.message);
    }
  }

  async function start() {
    unlockSpeech(); // must happen inside the click
    setStarting(true);
    try {
      const { questions } = await api(`/attempts/${attemptId}/start`, { method: "POST" });
      onReady(questions);
    } catch (err) {
      setStarting(false);
      onError(err);
    }
  }

  return (
    <Card className="space-y-4">
      <h2 className="font-bold text-lg">Before you start</h2>
      <ol className="list-decimal pl-5 text-sm text-slate-700 space-y-1.5">
        <li>Each question is <b>read aloud</b> and shown on screen.</li>
        <li>You get <b>10 seconds</b> to think.</li>
        <li>Recording starts automatically — speak German for up to <b>50 seconds</b>.</li>
        <li>Do not close or reload this page during the exam.</li>
      </ol>

      <div className="rounded-lg bg-slate-50 border p-4 space-y-2">
        <p className="text-sm font-medium">Microphone check</p>
        <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
          <div ref={levelRef} className="h-full bg-emerald-500 transition-all" style={{ width: "0%" }} />
        </div>
        <p className={`text-xs ${micError ? "text-red-600" : "text-slate-500"}`}>
          {micError || (micStream ? "Microphone active. Speak — the bar should move." : 'Click "Allow microphone" and say something.')}
        </p>
        {!micStream && <Button variant="dark" className="text-sm py-2" onClick={allowMic}>Allow microphone</Button>}
      </div>

      <Button className="py-3" disabled={!micStream || starting} onClick={start}>
        {starting ? "Preparing questions…" : "Start Exam (5 minutes)"}
      </Button>
    </Card>
  );
}
