import { useEffect, useState } from "react";
import { api } from "../api";
import { RunDetails } from "../components/RunDetails";
import type { SupportApi, SupportRun } from "../types";

interface RunViewProps {
  runId: string;
  client?: SupportApi;
  onFollowUp?: (threadId: string) => void;
}

export function RunView({ runId, client = api, onFollowUp }: RunViewProps) {
  const [run, setRun] = useState<SupportRun>();
  const [error, setError] = useState("");
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let polling: number | undefined;

    const poll = async () => {
      try {
        const nextRun = await client.getRun(runId);
        if (cancelled) return;

        setRun(nextRun);
        setError("");
        if (nextRun.status !== "completed" && nextRun.status !== "failed") {
          polling = window.setTimeout(() => void poll(), 2500);
        }
      } catch (cause) {
        if (cancelled) return;

        setError(cause instanceof Error ? cause.message : "Unable to load the run.");
        polling = window.setTimeout(() => void poll(), 2500);
      }
    };

    setRun((current) => current?.run_id === runId ? current : undefined);
    setError("");
    void poll();
    return () => {
      cancelled = true;
      window.clearTimeout(polling);
    };
  }, [client, refreshCount, runId]);

  return (
    <main className="page">
      <div className="page-intro inline-intro">
        <div>
          <p className="eyebrow">Live run</p>
          <h1>Watch the backend work.</h1>
          <p>Refreshing every 2.5 seconds while the run is in progress.</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => setRefreshCount((count) => count + 1)}>Refresh now</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {!run && !error && <p className="loading">Loading run...</p>}
      {run && <>
        <RunDetails run={run} />
        {onFollowUp && run.status === "completed" && <button className="secondary-button follow-up-button" type="button" onClick={() => onFollowUp(run.thread_id)}>Send a follow-up in this thread</button>}
        {onFollowUp && run.status === "awaiting_approval" && <p className="follow-up-note">You can send a follow-up after this run completes.</p>}
      </>}
    </main>
  );
}
