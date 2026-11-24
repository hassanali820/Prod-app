// TEST MODE only: stands in for the Stripe checkout page.
import { useState } from "react";
import { api } from "../lib/api.js";
import { Button, Card } from "../components/ui.jsx";

export default function MockCheckout() {
  const params = new URLSearchParams(window.location.search);
  const attemptId = params.get("attemptId");
  const session = params.get("session");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function pay() {
    setBusy(true);
    setError("");
    try {
      const { redirect } = await api("/payments/mock-pay", { method: "POST", body: { attemptId, session } });
      window.location.href = redirect;
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-sm w-full space-y-4 text-center">
        <p className="text-xs font-bold text-amber-700 bg-amber-100 rounded py-1">TEST MODE — no real payment</p>
        <h1 className="text-xl font-bold">GerLinx German Oral Proficiency Test</h1>
        <p className="text-4xl font-bold">€1.00</p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button onClick={pay} disabled={busy}>{busy ? "Processing…" : "Pay €1.00 (simulated)"}</Button>
        <a href="/?payment=cancelled" className="block text-sm text-slate-500 underline">Cancel</a>
      </Card>
    </div>
  );
}
