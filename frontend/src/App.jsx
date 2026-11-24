// Holds the app state and decides which screen is shown.
import { useEffect, useState } from "react";
import { api, getToken, setToken } from "./lib/api.js";
import { stopMicrophone } from "./lib/audio.js";
import { CenteredStatus, Flash, Spinner } from "./components/ui.jsx";
import AuthPage from "./pages/AuthPage.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import PaymentWait from "./pages/PaymentWait.jsx";
import Precheck from "./pages/Precheck.jsx";
import Exam from "./pages/Exam.jsx";
import Grading from "./pages/Grading.jsx";
import Result from "./pages/Result.jsx";

export default function App() {
  const [screen, setScreen] = useState("loading");
  const [user, setUser] = useState(null);
  const [testMode, setTestMode] = useState(false);
  const [message, setMessage] = useState(null); // { type, text }
  const [resetToken, setResetToken] = useState(null);
  const [attemptId, setAttemptId] = useState(null);
  const [micStream, setMicStream] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [result, setResult] = useState(null);

  const flash = (text, type = "info") => setMessage(text ? { text, type } : null);
  const go = (next) => { setScreen(next); window.scrollTo({ top: 0 }); };

  // Startup: read URL params (payment redirect, reset link) and restore the session.
  useEffect(() => {
    api("/config").then((c) => setTestMode(c.testMode)).catch(() => {});

    const params = new URLSearchParams(window.location.search);
    const payment = params.get("payment");
    const paidAttempt = params.get("attemptId");
    const reset = params.get("reset");
    if (window.location.search) window.history.replaceState(null, "", "/");

    if (reset) { setResetToken(reset); return go("reset"); }
    if (payment === "cancelled") flash("Payment was cancelled. You have not been charged.");
    if (!getToken()) return go("auth");

    api("/auth/me")
      .then(({ user }) => {
        setUser(user);
        if (payment === "success" && paidAttempt) { setAttemptId(paidAttempt); go("verify"); }
        else go("dashboard");
      })
      .catch(() => { setToken(null); go("auth"); });
  }, []);

  // Warn before closing the tab during the exam or grading.
  useEffect(() => {
    if (screen !== "exam" && screen !== "grading") return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [screen]);

  const onLoggedIn = (token, u) => { setToken(token); setUser(u); flash(null); go("dashboard"); };

  const logout = () => {
    if (screen === "exam" && !window.confirm("Leave the exam? Your attempt may be lost.")) return;
    setToken(null);
    stopMicrophone(micStream);
    setMicStream(null);
    setUser(null);
    flash(null);
    go("auth");
  };

  const toPrecheck = (id) => { setAttemptId(id); go("precheck"); };
  const backToDashboard = () => go("dashboard");

  const screens = {
    loading: <div className="flex justify-center py-16"><Spinner /></div>,
    auth: <AuthPage onLoggedIn={onLoggedIn} flash={flash} />,
    reset: <ResetPassword token={resetToken} onDone={() => { flash("Password updated. Please log in.", "success"); go("auth"); }} />,
    dashboard: <Dashboard user={user} flash={flash} onStart={toPrecheck} />,
    verify: (
      <PaymentWait
        attemptId={attemptId}
        onPaid={() => { flash("Payment confirmed. Good luck!", "success"); go("precheck"); }}
        onTimeout={() => {
          flash("We could not confirm your payment yet. If you were charged, refresh in a minute — the attempt will appear on the dashboard.", "error");
          go("dashboard");
        }}
      />
    ),
    precheck: (
      <Precheck
        attemptId={attemptId}
        micStream={micStream}
        setMicStream={setMicStream}
        onReady={(qs) => { flash(null); setQuestions(qs); go("exam"); }}
        onError={(err) => { flash(err.message, "error"); if (err.status === 400 || err.status === 403) go("dashboard"); }}
      />
    ),
    exam: (
      <Exam
        questions={questions}
        micStream={micStream}
        onFinished={(recorded) => { setAnswers(recorded); go("grading"); }}
      />
    ),
    grading: (
      <Grading
        attemptId={attemptId}
        answers={answers}
        onResult={(r) => { setResult(r); go("result"); }}
        onGiveUp={backToDashboard}
      />
    ),
    result: <Result result={result} onBack={backToDashboard} />
  };

  return (
    <div className="min-h-screen flex flex-col">
      {testMode && (
        <div className="bg-amber-400 text-amber-950 text-xs font-bold text-center py-1">
          TEST MODE — mock payment / mock AI grading
        </div>
      )}
      <header className="bg-slate-900 text-white py-4 px-4 sm:px-6 shadow">
        <div className="max-w-xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-lg font-bold tracking-tight">GerLinx<span className="text-amber-400">.de</span></h1>
            <p className="text-xs text-slate-300">5-Minute German Oral Proficiency Test</p>
          </div>
          {user && (
            <button onClick={logout} className="text-xs bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded">Logout</button>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-xl w-full mx-auto p-4 sm:p-6">
        <Flash message={message} />
        {screens[screen] || <CenteredStatus title="Unknown page" />}
      </main>

      <footer className="text-center text-xs text-slate-400 py-4">
        © GerLinx.de · <a href="https://gerlinx.de/impressum" className="underline">Impressum</a> ·{" "}
        <a href="https://gerlinx.de/datenschutz" className="underline">Datenschutz</a>
      </footer>
    </div>
  );
}
