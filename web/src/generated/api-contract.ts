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
  created_at?: string | null;
  message_preview?: string | null;
  extraction?: StructuredExtraction | null;
  route?: SupportRoute | null;
  proposed_refund?: ProposedRefund | null;
  answer?: string | null;
  error?: string | null;
}

export interface CreateRunRequest {
  message: string;
  thread_id?: string | null;
  customer?: CustomerIdentity | null;
  order_number?: string | null;
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
  total: number;
  limit: number;
  offset: number;
}

export interface CustomerInput {
  email: string;
  name: string;
}

export interface Customer {
  email: string;
  name: string;
  id: number;
}

export interface CustomerListResponse {
  customers: Customer[];
}

export interface ProductInput {
  title: string;
  format: "Blu-ray" | "DVD" | "4K UHD" | "box set";
  sku: string;
  price_cents: number;
}

export interface Product {
  title: string;
  format: "Blu-ray" | "DVD" | "4K UHD" | "box set";
  sku: string;
  price_cents: number;
  id: number;
}

export interface ProductListResponse {
  products: Product[];
}

export interface OrderInput {
  order_number: string;
  customer_id: number;
  product_id: number;
  quantity: number;
  ordered_at: string;
  status: string;
  refund_status?: "none" | "approved" | "rejected";
}

export interface Order {
  order_number: string;
  customer_id: number;
  product_id: number;
  quantity: number;
  ordered_at: string;
  status: string;
  refund_status?: "none" | "approved" | "rejected";
  id: number;
}

export interface OrderListResponse {
  orders: Order[];
}

export interface CustomerIdentity {
  id: number;
  name: string;
  email: string;
}

export interface CustomerIdentificationRequest {
  name: string;
  email: string;
}

export interface CustomerIdentificationResponse {
  customer?: CustomerIdentity | null;
}

export type RefundProgress = "none" | "awaiting_approval" | "approved" | "rejected";

export interface CustomerOrder {
  order_number: string;
  title: string;
  media_format: string;
  quantity: number;
  ordered_at: string;
  status: string;
  refund_progress: RefundProgress;
}

export interface CustomerOrderList {
  orders: CustomerOrder[];
}
