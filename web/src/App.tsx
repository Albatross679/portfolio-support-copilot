import { useEffect, useState } from "react";
import { ApprovalInboxView } from "./views/ApprovalInboxView";
import { BusinessDataView } from "./views/BusinessDataView";
import { RunMonitorView } from "./views/RunMonitorView";
import { RunView } from "./views/RunView";
import { SubmitView } from "./views/SubmitView";

function currentPath(): string { return window.location.pathname; }
function currentThreadId(): string | undefined { return new URLSearchParams(window.location.search).get("thread_id") ?? undefined; }
function navigate(path: string) { window.history.pushState({}, "", path); window.dispatchEvent(new PopStateEvent("popstate")); }

export default function App() {
  const [path, setPath] = useState(currentPath);
  const [threadId, setThreadId] = useState(currentThreadId);
  useEffect(() => { const updatePath = () => { setPath(currentPath()); setThreadId(currentThreadId()); }; window.addEventListener("popstate", updatePath); return () => window.removeEventListener("popstate", updatePath); }, []);

  const employeeRunId = path.match(/^\/employees\/runs\/([^/]+)$/)?.[1];
  const customerRunId = path.match(/^\/runs\/([^/]+)$/)?.[1];
  const employeePath = path.startsWith("/employees") || path === "/approvals";
  const view = employeeRunId ? <RunView runId={decodeURIComponent(employeeRunId)} />
    : customerRunId ? <RunView runId={decodeURIComponent(customerRunId)} onFollowUp={(id) => navigate(`/?thread_id=${encodeURIComponent(id)}`)} />
    : path === "/employees/approvals" || path === "/approvals" ? <ApprovalInboxView onOpenRun={(id) => navigate(`/employees/runs/${encodeURIComponent(id)}`)} />
    : path === "/employees/data" ? <BusinessDataView />
    : path === "/employees" || path === "/employees/runs" ? <RunMonitorView onOpenRun={(id) => navigate(`/employees/runs/${encodeURIComponent(id)}`)} />
    : <SubmitView threadId={threadId} onClearThread={() => navigate("/")} onRunCreated={(id) => navigate(`/runs/${encodeURIComponent(id)}`)} />;

  return <div className="app-shell">
    <header className="site-header"><a className="brand" href="/" onClick={(event) => { event.preventDefault(); navigate("/"); }}>Support Copilot</a><nav aria-label="Main navigation"><a href="/" className={!employeePath ? "active" : ""} onClick={(event) => { event.preventDefault(); navigate("/"); }}>Customer console</a><a href="/employees" className={employeePath ? "active" : ""} onClick={(event) => { event.preventDefault(); navigate("/employees"); }}>Employee console</a></nav></header>
    {employeePath && !employeeRunId && <nav className="employee-nav" aria-label="Employee navigation"><a href="/employees/runs" className={path === "/employees" || path === "/employees/runs" ? "active" : ""} onClick={(event) => { event.preventDefault(); navigate("/employees/runs"); }}>Run monitoring</a><a href="/employees/approvals" className={path === "/employees/approvals" || path === "/approvals" ? "active" : ""} onClick={(event) => { event.preventDefault(); navigate("/employees/approvals"); }}>Approval inbox</a><a href="/employees/data" className={path === "/employees/data" ? "active" : ""} onClick={(event) => { event.preventDefault(); navigate("/employees/data"); }}>Business data</a></nav>}
    {view}
  </div>;
}
