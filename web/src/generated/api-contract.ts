// Generated from api-contract.json by scripts/generate-contract.mjs.

export type RunStatus = "queued" | "running" | "awaiting_approval" | "completed" | "failed";

export interface StructuredExtraction {
  order_number?: string | null;
  product_title?: string | null;
  media_format?: "Blu-ray" | "DVD" | "4K UHD" | "box set" | "unknown";
  issue_type?: "billing" | "shipping" | "returns" | "refund" | "damaged_disc" | "region_code" | "preorder" | "sales_query" | "general";
  sentiment?: "positive" | "neutral" | "frustrated" | "angry";
}

export interface SupportRoute {
  lane: "billing" | "shipping" | "returns" | "general";
  handler: "rag" | "sql" | "refund";
  rationale: string;
}

export interface ProposedRefund {
  order_number: string;
  amount_cents: number;
  currency?: "USD";
  reason: string;
}

export interface SupportRun {
  run_id: string;
  thread_id: string;
  status: RunStatus;
  extraction?: StructuredExtraction | null;
  route?: SupportRoute | null;
  proposed_refund?: ProposedRefund | null;
  answer?: string | null;
  error?: string | null;
}

export interface CreateRunRequest {
  message: string;
  thread_id?: string | null;
}

export interface CreateRunResponse {
  run_id: string;
  thread_id: string;
}

export interface DecisionRequest {
  decision: "approve" | "reject";
}

export interface RunListResponse {
  runs: SupportRun[];
}
