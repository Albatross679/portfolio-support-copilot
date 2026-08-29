import { FormEvent, useState } from "react";
import { api } from "../api";
import type { SupportApi } from "../types";

interface SubmitViewProps {
  client?: SupportApi;
  onRunCreated: (runId: string) => void;
}

export function SubmitView({ client = api, onRunCreated }: SubmitViewProps) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim()) {
      setError("Enter a customer support message.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const { run_id } = await client.createRun({ message: message.trim() });
      onRunCreated(run_id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create the run.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page submit-page">
      <div className="page-intro">
        <p className="eyebrow">New support run</p>
        <h1>Send a customer message to the copilot.</h1>
        <p>This console submits work and shows its progress. Extraction, routing, retrieval, and refund decisions happen in the backend.</p>
      </div>
      <form className="message-form" onSubmit={handleSubmit}>
        <label htmlFor="support-message">Customer message</label>
        <textarea id="support-message" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Example: My order #2048 arrived with a scratched 4K disc. Can I get a refund?" rows={8} />
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={submitting}>{submitting ? "Starting run..." : "Start support run"}</button>
      </form>
    </main>
  );
}
