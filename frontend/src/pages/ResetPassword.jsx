import { useState } from "react";
import { api } from "../lib/api.js";
import { Button, Card, Field } from "../components/ui.jsx";

export default function ResetPassword({ token, onDone }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api("/auth/reset-password", { method: "POST", body: { token, password } });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3">
      <h2 className="font-bold text-lg">Set a new password</h2>
      <form onSubmit={submit} className="space-y-3">
        <Field label="New password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password" placeholder="Min. 6 characters" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={busy}>Save password</Button>
      </form>
    </Card>
  );
}
