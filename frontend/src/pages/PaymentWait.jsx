// After the Stripe redirect: poll until the webhook has marked the attempt as paid.
import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { CenteredStatus, Spinner } from "../components/ui.jsx";

export default function PaymentWait({ attemptId, onPaid, onTimeout }) {
  const [hint, setHint] = useState("This usually takes a few seconds.");

  useEffect(() => {
    let stopped = false;
    (async () => {
      for (let i = 0; i < 30 && !stopped; i++) {
        try {
          const a = await api(`/attempts/${attemptId}`);
          if (a.paid && !a.completed) return onPaid();
          if (a.completed) break;
        } catch { /* keep trying */ }
        if (i === 10) setHint("Still waiting for Stripe… please don't close this page.");
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (!stopped) onTimeout();
    })();
    return () => { stopped = true; };
  }, [attemptId]);

  return (
    <CenteredStatus title="Confirming your payment…" hint={hint}>
      <Spinner />
    </CenteredStatus>
  );
}
