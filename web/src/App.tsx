import { useEffect, useState } from "react";
import { api } from "./api";
import type { CustomerIdentity } from "./types";
import { ApprovalInboxView } from "./views/ApprovalInboxView";
import { BusinessDataView } from "./views/BusinessDataView";
import { CustomerPortalView } from "./views/CustomerPortalView";
import { RunMonitorView } from "./views/RunMonitorView";
import { RunView } from "./views/RunView";

const CUSTOMER_STORAGE_KEY = "support-copilot.customer";

function currentPath(): string {
  return window.location.pathname;
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
  const [customer, setCustomer] = useState<CustomerIdentity | undefined>(savedCustomer);

  useEffect(() => {
    const updatePath = () => setPath(currentPath());
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

  const employeeRunId = path.match(/^\/employees\/runs\/([^/]+)$/)?.[1];
  const customerRunId = path.match(/^\/customer\/runs\/([^/]+)$/)?.[1];
  const employeePath = path.startsWith("/employees") || path === "/approvals";
  const customerClient = customer
    ? { ...api, getRun: (id: string) => api.getCustomerRun(customer, id) }
    : api;
  const view = employeeRunId
    ? <RunView runId={decodeURIComponent(employeeRunId)} />
    : customerRunId
      ? customer
        ? <RunView client={customerClient} runId={decodeURIComponent(customerRunId)} />
        : <CustomerPortalView customer={customer} onIdentified={identify} onSignedOut={signOut} onRunCreated={(id) => navigate(`/customer/runs/${encodeURIComponent(id)}`)} />
      : path === "/employees/approvals" || path === "/approvals"
        ? <ApprovalInboxView onOpenRun={(id) => navigate(`/employees/runs/${encodeURIComponent(id)}`)} />
        : path === "/employees/data"
          ? <BusinessDataView />
          : path === "/employees" || path === "/employees/runs"
            ? <RunMonitorView onOpenRun={(id) => navigate(`/employees/runs/${encodeURIComponent(id)}`)} />
            : <CustomerPortalView customer={customer} onIdentified={identify} onSignedOut={signOut} onRunCreated={(id) => navigate(`/customer/runs/${encodeURIComponent(id)}`)} />;

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" onClick={(event) => { event.preventDefault(); navigate("/"); }}>Support Copilot</a>
        <nav aria-label="Main navigation">
          <a href="/" className={!employeePath ? "active" : ""} onClick={(event) => { event.preventDefault(); navigate("/"); }}>Customer portal</a>
          <a href="/employees" className={employeePath ? "active" : ""} onClick={(event) => { event.preventDefault(); navigate("/employees"); }}>Employee console</a>
        </nav>
      </header>
      {employeePath && !employeeRunId && (
        <nav className="employee-nav" aria-label="Employee navigation">
          <a href="/employees/runs" className={path === "/employees" || path === "/employees/runs" ? "active" : ""} onClick={(event) => { event.preventDefault(); navigate("/employees/runs"); }}>Run monitoring</a>
          <a href="/employees/approvals" className={path === "/employees/approvals" || path === "/approvals" ? "active" : ""} onClick={(event) => { event.preventDefault(); navigate("/employees/approvals"); }}>Approval inbox</a>
          <a href="/employees/data" className={path === "/employees/data" ? "active" : ""} onClick={(event) => { event.preventDefault(); navigate("/employees/data"); }}>Business data</a>
        </nav>
      )}
      {view}
    </div>
  );
}
