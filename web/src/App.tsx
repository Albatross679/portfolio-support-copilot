import { useEffect, useState } from "react";
import { api } from "./api";
import type { CustomerIdentity } from "./types";
import { ApprovalInboxView } from "./views/ApprovalInboxView";
import { CustomerPortalView } from "./views/CustomerPortalView";
import { RunView } from "./views/RunView";
import { SubmitView } from "./views/SubmitView";

const CUSTOMER_STORAGE_KEY = "support-copilot.customer";

function currentPath(): string {
  return window.location.pathname;
}

function currentThreadId(): string | undefined {
  return new URLSearchParams(window.location.search).get("thread_id") ?? undefined;
}

function savedCustomer(): CustomerIdentity | undefined {
  try {
    const value = window.localStorage.getItem(CUSTOMER_STORAGE_KEY);
    return value ? JSON.parse(value) as CustomerIdentity : undefined;
  } catch {
    return undefined;
  }
}

function navigate(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export default function App() {
  const [path, setPath] = useState(currentPath);
  const [threadId, setThreadId] = useState(currentThreadId);
  const [customer, setCustomer] = useState<CustomerIdentity | undefined>(savedCustomer);

  useEffect(() => {
    const updatePath = () => {
      setPath(currentPath());
      setThreadId(currentThreadId());
    };
    window.addEventListener("popstate", updatePath);
    return () => window.removeEventListener("popstate", updatePath);
  }, []);

  function identify(nextCustomer: CustomerIdentity) {
    window.localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(nextCustomer));
    setCustomer(nextCustomer);
  }

  function signOut() {
    window.localStorage.removeItem(CUSTOMER_STORAGE_KEY);
    setCustomer(undefined);
  }

  const customerRunId = path.match(/^\/customer\/runs\/([^/]+)$/)?.[1];
  const runId = path.match(/^\/runs\/([^/]+)$/)?.[1];
  const customerClient = customer ? { ...api, getRun: (id: string) => api.getCustomerRun(customer, id) } : api;
  const view = customerRunId
    ? customer
      ? <RunView client={customerClient} runId={decodeURIComponent(customerRunId)} />
      : <CustomerPortalView customer={customer} onIdentified={identify} onSignedOut={signOut} onRunCreated={(id) => navigate(`/customer/runs/${encodeURIComponent(id)}`)} />
    : runId
      ? <RunView runId={decodeURIComponent(runId)} onFollowUp={(id) => navigate(`/employee?thread_id=${encodeURIComponent(id)}`)} />
      : path === "/approvals"
        ? <ApprovalInboxView onOpenRun={(id) => navigate(`/runs/${encodeURIComponent(id)}`)} />
        : path === "/employee"
          ? <SubmitView threadId={threadId} onClearThread={() => navigate("/employee")} onRunCreated={(id) => navigate(`/runs/${encodeURIComponent(id)}`)} />
          : <CustomerPortalView customer={customer} onIdentified={identify} onSignedOut={signOut} onRunCreated={(id) => navigate(`/customer/runs/${encodeURIComponent(id)}`)} />;

  const customerActive = path === "/" || path === "/customer" || path.startsWith("/customer/");
  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" onClick={(event) => { event.preventDefault(); navigate("/"); }}>Support Copilot</a>
        <nav aria-label="Main navigation">
          <a href="/" className={customerActive ? "active" : ""} onClick={(event) => { event.preventDefault(); navigate("/"); }}>Customer portal</a>
          <a href="/employee" className={path === "/employee" || Boolean(runId) ? "active" : ""} onClick={(event) => { event.preventDefault(); navigate("/employee"); }}>Employee console</a>
          <a href="/approvals" className={path === "/approvals" ? "active" : ""} onClick={(event) => { event.preventDefault(); navigate("/approvals"); }}>Approval inbox</a>
        </nav>
      </header>
      {view}
    </div>
  );
}
