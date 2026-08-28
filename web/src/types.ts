export type RunStatus = "queued" | "processing" | "awaiting_approval" | "completed" | "failed";

export type SupportRoute = "billing" | "shipping" | "returns" | "general" | "refund";

export interface StructuredExtraction {
  order_number: string | null;
  product_title: string | null;
  format: string | null;
  issue_type: string | null;
  sentiment: string | null;
}

export interface ProposedRefund {
  amount: number;
  currency: string;
  reason: string;
}

export interface SupportRun {
  run_id: string;
  status: RunStatus;
  message?: string;
  extraction?: StructuredExtraction;
  route?: SupportRoute;
  final_answer?: string;
  proposed_refund?: ProposedRefund;
  error?: string;
}

export interface CreateRunRequest {
  message: string;
}

export interface CreateRunResponse {
  run_id: string;
}

export interface DecisionRequest {
  decision: "approve" | "reject";
}

export interface DecisionResponse {
  run_id: string;
  status: RunStatus;
}

export interface RunListResponse {
  runs: SupportRun[];
}

export interface SupportApi {
  createRun(request: CreateRunRequest): Promise<CreateRunResponse>;
  getRun(runId: string): Promise<SupportRun>;
  listRuns(status?: RunStatus): Promise<RunListResponse>;
  decideRun(runId: string, request: DecisionRequest): Promise<DecisionResponse>;
}
