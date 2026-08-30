import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { SupportApi, SupportRun } from "../types";

interface RunMonitorViewProps {
  client?: SupportApi;
  onOpenRun: (runId: string) => void;
}

export function RunMonitorView({ client = api, onOpenRun }: RunMonitorViewProps) {
  const [runs, setRuns] = useState<SupportRun[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  const limit = 25;

  const loadRuns = useCallback(async () => {
    try {
      const result = await client.listRuns(undefined, limit, offset);
      setRuns(result.runs);
      setTotal(result.total);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load recent runs.");
    }
  }, [client, offset]);

  useEffect(() => { void loadRuns(); }, [loadRuns]);

  return <main className="page">
    <div className="page-intro inline-intro">
      <div><p className="eyebrow">Employee console</p><h1>Recent support runs.</h1><p>Newest runs appear first. Open a run to see its full detail.</p></div>
      <button className="secondary-button" type="button" onClick={() => void loadRuns()}>Refresh runs</button>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {!error && <div className="table-card"><table><thead><tr><th>Run</th><th>Status</th><th>Route</th><th>Customer message</th><th></th></tr></thead><tbody>{runs.map((run) => <tr key={run.run_id}><td><code>{run.run_id}</code></td><td><span className={`status status-${run.status}`}>{run.status.replace("_", " ")}</span></td><td>{run.route ? `${run.route.lane} / ${run.route.handler}` : "Pending"}</td><td>{run.message_preview || "No message preview"}</td><td><button className="link-button" type="button" onClick={() => onOpenRun(run.run_id)}>Open run</button></td></tr>)}</tbody></table>{runs.length === 0 && <p className="empty-state">No runs found.</p>}</div>}
    <div className="pagination"><button className="secondary-button" type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>Previous</button><p>{total === 0 ? "No runs" : `${offset + 1}-${Math.min(offset + limit, total)} of ${total}`}</p><button className="secondary-button" type="button" disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}>Next</button></div>
  </main>;
}
