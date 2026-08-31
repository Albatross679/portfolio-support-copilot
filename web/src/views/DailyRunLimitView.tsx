import { FormEvent, useEffect, useState } from "react";
import { api } from "../api";
import type { SupportApi } from "../types";

interface DailyRunLimitViewProps { client?: SupportApi; }

export function DailyRunLimitView({ client = api }: DailyRunLimitViewProps) {
  const [limit, setLimit] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void client.getDailyRunLimit().then(
      ({ daily_run_limit }) => setLimit(String(daily_run_limit)),
      (cause: unknown) => setError(cause instanceof Error ? cause.message : "Unable to load the daily run limit."),
    );
  }, [client]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(limit);
    if (!Number.isInteger(value) || value < 0) {
      setError("Enter a whole number of zero or more.");
      return;
    }
    setError(""); setSaved(false); setBusy(true);
    try {
      const { daily_run_limit } = await client.setDailyRunLimit(value);
      setLimit(String(daily_run_limit)); setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save the daily run limit.");
    } finally { setBusy(false); }
  }

  return <main className="page"><div className="page-intro"><p className="eyebrow">Employee console</p><h1>Daily demo budget.</h1><p>Set the total support runs allowed across the demo each UTC day. Set zero to disable the cap.</p></div><form className="message-form" onSubmit={save}><label htmlFor="daily-run-limit">Daily run limit</label><input id="daily-run-limit" type="number" min="0" step="1" value={limit} onChange={(event) => setLimit(event.target.value)} required />{error && <p className="error" role="alert">{error}</p>}{saved && <p role="status">Daily run limit saved.</p>}<button type="submit" disabled={busy}>{busy ? "Saving..." : "Save limit"}</button></form></main>;
}
