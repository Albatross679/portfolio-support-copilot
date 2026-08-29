import { useEffect, useState } from "react";
import { ApprovalInboxView } from "./views/ApprovalInboxView";
import { RunView } from "./views/RunView";
import { SubmitView } from "./views/SubmitView";

function currentPath(): string {
  return window.location.pathname;
}

function currentThreadId(): string | undefined {
  return new URLSearchParams(window.location.search).get("thread_id") ?? undefined;
}

function navigate(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export default function App() {
  const [path, setPath] = useState(currentPath);
  const [threadId, setThreadId] = useState(currentThreadId);

  useEffect(() => {
    const updatePath = () => {
      setPath(currentPath());
      setThreadId(currentThreadId());
    };
    window.addEventListener("popstate", updatePath);
    return () => window.removeEventListener("popstate", updatePath);
  }, []);

  const runId = path.match(/^\/runs\/([^/]+)$/)?.[1];
  const view = runId
    ? <RunView runId={decodeURIComponent(runId)} onFollowUp={(id) => navigate(`/?thread_id=${encodeURIComponent(id)}`)} />
    : path === "/approvals"
      ? <ApprovalInboxView onOpenRun={(id) => navigate(`/runs/${encodeURIComponent(id)}`)} />
      : <SubmitView threadId={threadId} onClearThread={() => navigate("/")} onRunCreated={(id) => navigate(`/runs/${encodeURIComponent(id)}`)} />;

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" onClick={(event) => { event.preventDefault(); navigate("/"); }}>Support Copilot</a>
        <nav aria-label="Main navigation">
          <a href="/" className={path === "/" ? "active" : ""} onClick={(event) => { event.preventDefault(); navigate("/"); }}>Submit</a>
          <a href="/approvals" className={path === "/approvals" ? "active" : ""} onClick={(event) => { event.preventDefault(); navigate("/approvals"); }}>Approval inbox</a>
        </nav>
      </header>
      {view}
    </div>
  );
}
