import type { CreateRunRequest, CreateRunResponse, DecisionRequest, DecisionResponse, RunListResponse, RunStatus, SupportApi, SupportRun } from "./types";

const API_BASE = (import.meta.env.VITE_API_BASE ?? (import.meta.env.DEV ? "/api" : "")).replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const httpApi: SupportApi = {
  createRun: (body: CreateRunRequest) => request<CreateRunResponse>("/runs", { method: "POST", body: JSON.stringify(body) }),
  getRun: (runId: string) => request<SupportRun>(`/runs/${encodeURIComponent(runId)}`),
  listRuns: (status?: RunStatus) => request<RunListResponse>(`/runs${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  decideRun: (runId: string, body: DecisionRequest) => request<DecisionResponse>(`/runs/${encodeURIComponent(runId)}/decision`, { method: "POST", body: JSON.stringify(body) }),
};

const initialRuns: SupportRun[] = [
  {
    run_id: "run_refund_2048",
    thread_id: "thread_refund_2048",
    status: "awaiting_approval",
    extraction: { order_number: "2048", product_title: "The Seventh Seal", media_format: "4K UHD", issue_type: "damaged_disc", sentiment: "frustrated" },
    route: { lane: "returns", handler: "refund", rationale: "Damaged item needs refund review." },
    proposed_refund: { order_number: "2048", amount_cents: 2999, currency: "USD", reason: "Damaged disc reported for order #2048" },
  },
  {
    run_id: "run_shipping_1082",
    thread_id: "thread_shipping_1082",
    status: "completed",
    extraction: { order_number: "1082", product_title: null, media_format: "Blu-ray", issue_type: "shipping", sentiment: "neutral" },
    route: { lane: "shipping", handler: "rag", rationale: "Shipping policy question." },
    answer: "Order #1082 is in transit and is expected to arrive on Thursday.",
  },
];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createMockApi(): SupportApi {
  let runs = clone(initialRuns);
  let sequence = 3000;

  return {
    async createRun({ message, thread_id }) {
      const runId = `run_demo_${sequence++}`;
      const nextThreadId = thread_id ?? `thread_demo_${sequence}`;
      const isRefund = /refund|money back|reimburse/i.test(message);
      runs.unshift({
        run_id: runId,
        thread_id: nextThreadId,
        status: isRefund ? "awaiting_approval" : "completed",
        extraction: {
          order_number: message.match(/(?:order\s*#?)(\d+)/i)?.[1] ?? null,
          product_title: /inception/i.test(message) ? "Inception" : null,
          media_format: /4k|uhd/i.test(message) ? "4K UHD" : /blu-?ray/i.test(message) ? "Blu-ray" : /dvd/i.test(message) ? "DVD" : "unknown",
          issue_type: isRefund ? "refund" : "general",
          sentiment: /please|thanks/i.test(message) ? "positive" : "neutral",
        },
        route: isRefund
          ? { lane: "returns", handler: "refund", rationale: "Customer requested a refund." }
          : { lane: "general", handler: "rag", rationale: "General policy question." },
        ...(isRefund
          ? { proposed_refund: { order_number: message.match(/(?:order\s*#?)(\d+)/i)?.[1] ?? "unknown", amount_cents: 1999, currency: "USD", reason: "Customer requested a simulated refund" } }
          : { answer: "Our return policy allows unopened physical media to be returned within 30 days of delivery." }),
      });
      return { run_id: runId, thread_id: nextThreadId };
    },
    async getRun(runId) {
      const run = runs.find((item) => item.run_id === runId);
      if (!run) throw new Error("Run not found");
      return clone(run);
    },
    async listRuns(status) {
      return { runs: clone(status ? runs.filter((run) => run.status === status) : runs) };
    },
    async decideRun(runId, { decision }) {
      const run = runs.find((item) => item.run_id === runId);
      if (!run) throw new Error("Run not found");
      if (run.status !== "awaiting_approval") throw new Error("Run is not awaiting approval");
      run.status = "completed";
      run.answer = decision === "approve"
        ? `Refund of ${run.proposed_refund?.currency} ${((run.proposed_refund?.amount_cents ?? 0) / 100).toFixed(2)} approved. The customer has been notified.`
        : "The refund request was reviewed and not approved. The customer has been notified.";
      return clone(run);
    },
  };
}

export const mockApi = createMockApi();
export const api: SupportApi = import.meta.env.VITE_MOCK_API === "1" ? mockApi : httpApi;
