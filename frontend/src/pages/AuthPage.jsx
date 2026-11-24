import { useState } from "react";
import { api } from "../lib/api.js";
import { Button, Card, Field } from "../components/ui.jsx";

const EMPTY = { full_name: "", date_of_birth: "", city: "", mobile_number: "", email: "", password: "" };

export default function AuthPage({ onLoggedIn, flash }) {
  const [isRegister, setIsRegister] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError("");
    flash(null);
    if (!form.email || form.password.length < 6) {
      return setError("Enter your email and a password of at least 6 characters.");
    }
    if (isRegister && !consent) return setError("Please accept the privacy notice to continue.");

    setBusy(true);
    try {
      const { token, user } = isRegister
        ? await api("/auth/register", { method: "POST", body: { ...form, consent } })
        : await api("/auth/login", { method: "POST", body: { email: form.email, password: form.password } });
      onLoggedIn(token, user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function forgotPassword() {
    if (!form.email) return setError("Enter your email above first.");
    try {
      await api("/auth/forgot-password", { method: "POST", body: { email: form.email } });
      flash("If this email is registered, a password reset link has been sent.", "success");
    } catch (err) {
      setError(err.message);
    }
  }

  const tab = (active) => `font-semibold pb-1 ${active ? "text-amber-600 border-b-2 border-amber-600" : "text-slate-500"}`;

  return (
    <Card className="space-y-4">
      <div className="flex border-b pb-2 gap-4">
        <button type="button" className={tab(isRegister)} onClick={() => { setIsRegister(true); setError(""); }}>
          New Candidate
        </button>
        <button type="button" className={tab(!isRegister)} onClick={() => { setIsRegister(false); setError(""); }}>
          Existing Login
        </button>
      </div>

      <form onSubmit={submit} className="space-y-3" noValidate>
        {isRegister && (
          <>
            <Field label="Full Name (as on Passport)" value={form.full_name} onChange={set("full_name")} autoComplete="name" placeholder="e.g. Muhammad Ali" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date of Birth" type="date" value={form.date_of_birth} onChange={set("date_of_birth")} />
              <Field label="City" value={form.city} onChange={set("city")} placeholder="e.g. Lahore / Görlitz" />
            </div>
            <Field label="Mobile Number (with country code)" type="tel" value={form.mobile_number} onChange={set("mobile_number")} autoComplete="tel" placeholder="e.g. +92 300 1234567" />
          </>
        )}
        <Field label="Email" type="email" value={form.email} onChange={set("email")} autoComplete="email" placeholder="you@example.com" />
        <Field label="Password" type="password" value={form.password} onChange={set("password")}
          autoComplete={isRegister ? "new-password" : "current-password"} placeholder="Min. 6 characters" />

        {isRegister && (
          <label className="flex items-start gap-2 text-xs text-slate-600">
            <input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>
              I agree that my data and voice recordings are processed for this assessment (Google Gemini, Stripe) as described in the{" "}
              <a href="https://gerlinx.de/datenschutz" target="_blank" rel="noopener noreferrer" className="text-amber-600 underline">Datenschutzerklärung</a>.
            </span>
          </label>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={busy}>{isRegister ? "Create Account & Continue" : "Login"}</Button>
        {!isRegister && (
          <button type="button" onClick={forgotPassword} className="w-full text-xs text-slate-500 underline">Forgot password?</button>
        )}
      </form>
    </Card>
  );
}
