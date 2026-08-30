import type {
  CreateRunRequest,
  CreateRunResponse,
  Customer,
  CustomerIdentificationRequest,
  CustomerIdentificationResponse,
  CustomerIdentity,
  CustomerInput,
  CustomerOrderList,
  DecisionRequest,
  DecisionResponse,
  Order,
  OrderInput,
  Product,
  ProductInput,
  RunListResponse,
  RunStatus,
  SupportApi,
  SupportRun,
} from "./types";

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

async function requestVoid(path: string, init?: RequestInit): Promise<void> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Request failed with ${response.status}`);
  }
}

export const httpApi: SupportApi = {
  createRun: (body: CreateRunRequest) => request<CreateRunResponse>("/runs", { method: "POST", body: JSON.stringify(body) }),
  getRun: (runId: string) => request<SupportRun>(`/runs/${encodeURIComponent(runId)}`),
  listRuns: (status?: RunStatus, limit = 25, offset = 0) => request<RunListResponse>(`/runs?${new URLSearchParams({ ...(status ? { status } : {}), limit: String(limit), offset: String(offset) })}`),
  decideRun: (runId: string, body: DecisionRequest) => request<DecisionResponse>(`/runs/${encodeURIComponent(runId)}/decision`, { method: "POST", body: JSON.stringify(body) }),
  identifyCustomer: (body: CustomerIdentificationRequest) => request<CustomerIdentificationResponse>("/customers/identify", { method: "POST", body: JSON.stringify(body) }),
  listCustomerOrders: (customer: CustomerIdentity) => request<CustomerOrderList>(`/customers/${customer.id}/orders?name=${encodeURIComponent(customer.name)}&email=${encodeURIComponent(customer.email)}`),
  getCustomerRun: (customer: CustomerIdentity, runId: string) => request<SupportRun>(`/customers/${customer.id}/runs/${encodeURIComponent(runId)}?name=${encodeURIComponent(customer.name)}&email=${encodeURIComponent(customer.email)}`),
  listCustomers: () => request("/customers"),
  createCustomer: (body) => request("/customers", { method: "POST", body: JSON.stringify(body) }),
  updateCustomer: (id, body) => request(`/customers/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteCustomer: (id) => requestVoid(`/customers/${id}`, { method: "DELETE" }),
  listProducts: () => request("/products"),
  createProduct: (body) => request("/products", { method: "POST", body: JSON.stringify(body) }),
  updateProduct: (id, body) => request(`/products/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteProduct: (id) => requestVoid(`/products/${id}`, { method: "DELETE" }),
  listOrders: () => request("/orders"),
  createOrder: (body) => request("/orders", { method: "POST", body: JSON.stringify(body) }),
  updateOrder: (id, body) => request(`/orders/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteOrder: (id) => requestVoid(`/orders/${id}`, { method: "DELETE" }),
};

const initialRuns: SupportRun[] = [
  {
    run_id: "run_refund_2048",
    thread_id: "thread_refund_2048",
    status: "awaiting_approval",
    created_at: "2025-01-02T12:00:00Z",
    message_preview: "My damaged 4K order 2048 needs a refund.",
    extraction: { order_number: "2048", product_title: "The Seventh Seal", media_format: "4K UHD", issue_type: "damaged_disc", sentiment: "frustrated" },
    route: { lane: "returns", handler: "refund", rationale: "Damaged item needs refund review." },
    proposed_refund: { order_number: "2048", amount_cents: 2999, currency: "USD", reason: "Damaged disc reported for order #2048" },
  },
  {
    run_id: "run_shipping_1082",
    thread_id: "thread_shipping_1082",
    status: "completed",
    created_at: "2025-01-01T12:00:00Z",
    message_preview: "Where is my Blu-ray order 1082?",
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
  const runCustomers = new Map<string, number>();
  const customerIdentities: CustomerIdentity[] = [
    { id: 1, name: "Maya Chen", email: "maya@example.test" },
    { id: 2, name: "Sam Rivera", email: "sam@example.test" },
    { id: 3, name: "Lee Patel", email: "lee@example.test" },
  ];
  const customerOrders: Record<number, CustomerOrderList> = {
    1: { orders: [
      { order_number: "ORD-1001", title: "The Last Horizon", media_format: "4K UHD", quantity: 1, ordered_at: "2025-02-14T12:00:00Z", status: "delivered", refund_progress: "none" },
      { order_number: "ORD-1004", title: "Cinema Classics Vol. 1", media_format: "box set", quantity: 1, ordered_at: "2025-02-05T12:00:00Z", status: "delivered", refund_progress: "none" },
    ] },
    2: { orders: [{ order_number: "ORD-1002", title: "The Last Horizon", media_format: "Blu-ray", quantity: 1, ordered_at: "2025-02-10T12:00:00Z", status: "shipped", refund_progress: "none" }] },
    3: { orders: [{ order_number: "ORD-1003", title: "Midnight Archive", media_format: "DVD", quantity: 2, ordered_at: "2025-01-13T12:00:00Z", status: "delivered", refund_progress: "rejected" }] },
  };
  let customers: Customer[] = [{ id: 1, name: "Maya Chen", email: "maya@example.test" }];
  let products: Product[] = [{ id: 1, title: "The Last Horizon", format: "4K UHD", sku: "TLH-4K", price_cents: 2999 }];
  let orders: Order[] = [{ id: 1, order_number: "ORD-1001", customer_id: 1, product_id: 1, quantity: 1, ordered_at: "2025-01-01T12:00:00Z", status: "delivered", refund_status: "none" }];
  let sequence = 3000;

  return {
    async createRun({ message, thread_id, customer, order_number }) {
      const runId = `run_demo_${sequence++}`;
      const nextThreadId = thread_id ?? `thread_demo_${sequence}`;
      const isRefund = /refund|money back|reimburse/i.test(message);
      runs.unshift({
        run_id: runId,
        thread_id: nextThreadId,
        status: isRefund ? "awaiting_approval" : "completed",
        created_at: new Date().toISOString(),
        message_preview: message.slice(0, 200),
        extraction: {
          order_number: order_number ?? message.match(/(?:order\s*#?)(\d+)/i)?.[1] ?? null,
          product_title: /inception/i.test(message) ? "Inception" : null,
          media_format: /4k|uhd/i.test(message) ? "4K UHD" : /blu-?ray/i.test(message) ? "Blu-ray" : /dvd/i.test(message) ? "DVD" : "unknown",
          issue_type: isRefund ? "refund" : "general",
          sentiment: /please|thanks/i.test(message) ? "positive" : "neutral",
        },
        route: isRefund ? { lane: "returns", handler: "refund", rationale: "Customer requested a refund." } : { lane: "general", handler: "rag", rationale: "General policy question." },
        ...(isRefund ? { proposed_refund: { order_number: order_number ?? message.match(/(?:order\s*#?)(\d+)/i)?.[1] ?? "unknown", amount_cents: 1999, currency: "USD" as const, reason: "Customer requested a simulated refund" } } : { answer: "Our return policy allows unopened physical media to be returned within 30 days of delivery." }),
      });
      if (customer) runCustomers.set(runId, customer.id);
      return { run_id: runId, thread_id: nextThreadId };
    },
    async getRun(runId) {
      const run = runs.find((item) => item.run_id === runId);
      if (!run) throw new Error("Run not found");
      return clone(run);
    },
    async listRuns(status, limit = 25, offset = 0) {
      const matching = status ? runs.filter((run) => run.status === status) : runs;
      return { runs: clone(matching.slice(offset, offset + limit)), total: matching.length, limit, offset };
    },
    async decideRun(runId, { decision }) {
      const run = runs.find((item) => item.run_id === runId);
      if (!run) throw new Error("Run not found");
      if (run.status !== "awaiting_approval") throw new Error("Run is not awaiting approval");
      run.status = "completed";
      run.answer = decision === "approve" ? `Refund of ${run.proposed_refund?.currency} ${((run.proposed_refund?.amount_cents ?? 0) / 100).toFixed(2)} approved. The customer has been notified.` : "The refund request was reviewed and not approved. The customer has been notified.";
      return clone(run);
    },
    async identifyCustomer({ name, email }) { return { customer: clone(customerIdentities.find((item) => item.name === name && item.email === email) ?? null) }; },
    async listCustomerOrders(customer) { return clone(customerOrders[customer.id] ?? { orders: [] }); },
    async getCustomerRun(customer, runId) {
      if (runCustomers.get(runId) !== customer.id) throw new Error("Run not found");
      const run = runs.find((item) => item.run_id === runId);
      if (!run) throw new Error("Run not found");
      return clone(run);
    },
    async listCustomers() { return { customers: clone(customers) }; },
    async createCustomer(input: CustomerInput) { const customer = { id: ++sequence, ...input }; customers.push(customer); return clone(customer); },
    async updateCustomer(id, input) { const index = customers.findIndex((item) => item.id === id); if (index < 0) throw new Error("Customer not found"); customers[index] = { id, ...input }; return clone(customers[index]); },
    async deleteCustomer(id) { customers = customers.filter((item) => item.id !== id); },
    async listProducts() { return { products: clone(products) }; },
    async createProduct(input: ProductInput) { const product = { id: ++sequence, ...input }; products.push(product); return clone(product); },
    async updateProduct(id, input) { const index = products.findIndex((item) => item.id === id); if (index < 0) throw new Error("Product not found"); products[index] = { id, ...input }; return clone(products[index]); },
    async deleteProduct(id) { products = products.filter((item) => item.id !== id); },
    async listOrders() { return { orders: clone(orders) }; },
    async createOrder(input: OrderInput) { const order = { id: ++sequence, ...input, refund_status: input.refund_status ?? "none" }; orders.push(order); return clone(order); },
    async updateOrder(id, input) { const index = orders.findIndex((item) => item.id === id); if (index < 0) throw new Error("Order not found"); orders[index] = { id, ...input, refund_status: input.refund_status ?? "none" }; return clone(orders[index]); },
    async deleteOrder(id) { orders = orders.filter((item) => item.id !== id); },
  };
}

export const mockApi = createMockApi();
export const api: SupportApi = import.meta.env.VITE_MOCK_API === "1" ? mockApi : httpApi;
