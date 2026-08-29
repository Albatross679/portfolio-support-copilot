import type { SupportRun } from "../types";

interface RunDetailsProps {
  run: SupportRun;
}

function value(value: string | null | undefined): string {
  return value || "Not available yet";
}

export function RunDetails({ run }: RunDetailsProps) {
  const route = run.route;

  return (
    <section className="run-details" aria-label="Run details">
      <div className="run-summary">
        <div>
          <span className="eyebrow">Run ID</span>
          <code>{run.run_id}</code>
        </div>
        <div>
          <span className="eyebrow">Status</span>
          <strong className={`status status-${run.status}`}>{run.status.replaceAll("_", " ")}</strong>
        </div>
      </div>

      <div className="detail-grid">
        <section>
          <h2>Structured extraction</h2>
          <dl>
            <div><dt>Order number</dt><dd>{value(run.extraction?.order_number)}</dd></div>
            <div><dt>Product title</dt><dd>{value(run.extraction?.product_title)}</dd></div>
            <div><dt>Format</dt><dd>{value(run.extraction?.media_format)}</dd></div>
            <div><dt>Issue type</dt><dd>{value(run.extraction?.issue_type)}</dd></div>
            <div><dt>Sentiment</dt><dd>{value(run.extraction?.sentiment)}</dd></div>
          </dl>
        </section>
        <section>
          <h2>Chosen route</h2>
          {route ? <>
            <p className="route">{route.lane} - {route.handler}</p>
            <p className="muted">{route.rationale}</p>
          </> : <p className="route">Pending routing</p>}
          <p className="muted">The backend selects the route and performs the policy or data lookup.</p>
        </section>
      </div>

      {run.status === "awaiting_approval" && run.proposed_refund && (
        <section className="approval-card" aria-label="Awaiting approval">
          <span className="eyebrow">Human action required</span>
          <h2>Proposed refund</h2>
          <p className="refund-amount">{new Intl.NumberFormat("en-US", { style: "currency", currency: run.proposed_refund.currency }).format(run.proposed_refund.amount_cents / 100)}</p>
          <p>{run.proposed_refund.reason}</p>
          <p className="muted">Approve or reject this request from the approval inbox.</p>
        </section>
      )}

      {run.answer && (
        <section className="answer-card">
          <span className="eyebrow">Final answer</span>
          <p>{run.answer}</p>
        </section>
      )}

      {run.error && <p className="error" role="alert">{run.error}</p>}
    </section>
  );
}
