import { useCallback, useEffect, useState } from "react";
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

  const loadRun = useCallback(async () => {
    try {
      setRun(await client.getRun(runId));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load the run.");
    }
  }, [client, runId]);

  useEffect(() => {
    void loadRun();
    const polling = window.setInterval(() => void loadRun(), 2500);
    return () => window.clearInterval(polling);
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
