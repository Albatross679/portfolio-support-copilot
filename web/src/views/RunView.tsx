import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { RunDetails } from "../components/RunDetails";
import type { SupportApi, SupportRun } from "../types";

interface RunViewProps {
  runId: string;
  client?: SupportApi;
}

export function RunView({ runId, client = api }: RunViewProps) {
  const [run, setRun] = useState<SupportRun>();
  const [error, setError] = useState("");
  const polling = useRef<number | undefined>(undefined);

  const loadRun = useCallback(async () => {
    try {
      const nextRun = await client.getRun(runId);
      setRun(nextRun);
      setError("");
      if (nextRun.status === "completed" || nextRun.status === "failed") {
        window.clearTimeout(polling.current);
        polling.current = undefined;
      }
      return nextRun;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load the run.");
      return undefined;
    }
  }, [client, runId]);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      const nextRun = await loadRun();
      const finished = nextRun?.status === "completed" || nextRun?.status === "failed";
      if (!cancelled && !finished) {
        polling.current = window.setTimeout(() => void poll(), 2500);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      window.clearTimeout(polling.current);
      polling.current = undefined;
    };
  }, [loadRun]);

  return (
    <main className="page">
      <div className="page-intro inline-intro">
        <div>
          <p className="eyebrow">Live run</p>
          <h1>Watch the backend work.</h1>
          <p>Refreshing every 2.5 seconds while the run is in progress.</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => void loadRun()}>Refresh now</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {!run && !error && <p className="loading">Loading run...</p>}
      {run && <RunDetails run={run} />}
    </main>
  );
}
