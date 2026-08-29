import contract from "../api-contract.json";

export const apiContract = contract;
export type RunStatus = "queued" | "running" | "awaiting_approval" | "completed" | "failed";

export interface StructuredExtraction {
  order_number: string | null;
  product_title: string | null;
  media_format: string | null;
  issue_type: string | null;
  sentiment: string | null;
}

export interface SupportRoute {
  lane: string;
  handler: string;
  rationale: string;
}

export interface ProposedRefund {
  order_number: string;
  amount_cents: number;
  currency: string;
  reason: string;
}

export interface SupportRun {
  run_id: string;
  thread_id: string;
  status: RunStatus;
  extraction?: StructuredExtraction;
  route?: SupportRoute;
  proposed_refund?: ProposedRefund;
  answer?: string;
  error?: string;
}

export interface CreateRunRequest {
  message: string;
  thread_id?: string;
}

export interface CreateRunResponse {
  run_id: string;
  thread_id: string;
}

export interface DecisionRequest {
  decision: "approve" | "reject";
}

export type DecisionResponse = SupportRun;

export interface RunListResponse {
  runs: SupportRun[];
}

export interface SupportApi {
  createRun(request: CreateRunRequest): Promise<CreateRunResponse>;
  getRun(runId: string): Promise<SupportRun>;
  listRuns(status?: RunStatus): Promise<RunListResponse>;
  decideRun(runId: string, request: DecisionRequest): Promise<DecisionResponse>;
}
