import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { RunDetails } from "../components/RunDetails";
import type { SupportApi, SupportRun } from "../types";

interface ApprovalInboxViewProps {
  client?: SupportApi;
  onOpenRun: (runId: string) => void;
}

export function ApprovalInboxView({ client = api, onOpenRun }: ApprovalInboxViewProps) {
  const [runs, setRuns] = useState<SupportRun[]>([]);
  const [error, setError] = useState("");
  const [busyRunId, setBusyRunId] = useState("");

  const loadRuns = useCallback(async () => {
    try {
      // The demo store will not have 100 simultaneous paused runs, so the inbox does not paginate.
      const result = await client.listRuns("awaiting_approval", 100);
      setRuns(result.runs);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load the approval inbox.");
    }
  }, [client]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  async function decide(runId: string, decision: "approve" | "reject") {
    setBusyRunId(runId);
    try {
      await client.decideRun(runId, { decision });
      setRuns((current) => current.filter((run) => run.run_id !== runId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save the decision.");
    } finally {
      setBusyRunId("");
    }
  }

  return (
    <main className="page">
      <div className="page-intro inline-intro">
        <div>
          <p className="eyebrow">Approval inbox</p>
          <h1>Refunds waiting for a person.</h1>
          <p>These runs are paused by the backend until you make a decision.</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => void loadRuns()}>Refresh inbox</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {runs.length === 0 && !error ? <p className="empty-state">No runs are awaiting approval.</p> : (
        <div className="inbox-list">
          {runs.map((run) => (
            <article className="inbox-item" key={run.run_id}>
              <RunDetails run={run} />
              <div className="button-row">
                <button type="button" onClick={() => void decide(run.run_id, "approve")} disabled={busyRunId === run.run_id}>Approve refund</button>
                <button type="button" className="danger-button" onClick={() => void decide(run.run_id, "reject")} disabled={busyRunId === run.run_id}>Reject refund</button>
                <button type="button" className="link-button" onClick={() => onOpenRun(run.run_id)}>Open run</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
