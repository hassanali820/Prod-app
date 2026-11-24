// Uploads the recordings and waits for the score. Offers Retry if grading fails.
import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { Button, CenteredStatus, Spinner } from "../components/ui.jsx";

export default function Grading({ attemptId, answers, onResult, onGiveUp }) {
  const [error, setError] = useState(null); // { message, canRetry }
  const [run, setRun] = useState(0);

  useEffect(() => {
    setError(null);
    api(`/attempts/${attemptId}/evaluate`, { method: "POST", body: { answers } })
      .then(onResult)
      .catch((err) => {
        const canRetry = err.retryable !== false && err.status !== 403;
        setError({ message: err.message, canRetry });
        if (!canRetry) setTimeout(onGiveUp, 4000);
      });
  }, [run]);

  if (error) {
    return (
      <CenteredStatus title={error.message}>
        {error.canRetry && <Button className="w-auto px-6" onClick={() => setRun(run + 1)}>Retry grading</Button>}
      </CenteredStatus>
    );
  }
  return (
    <CenteredStatus title="Your answers are being evaluated…" hint="This can take up to a minute. Please keep this page open.">
      <Spinner />
    </CenteredStatus>
  );
}
