import contract from "../api-contract.json";
import type {
  CreateRunRequest,
  CreateRunResponse,
  Customer,
  CustomerInput,
  CustomerListResponse,
  DecisionRequest,
  Order,
  OrderInput,
  OrderListResponse,
  Product,
  ProductInput,
  ProductListResponse,
  ProposedRefund,
  RunListResponse,
  RunStatus,
  StructuredExtraction,
  SupportRoute,
  SupportRun,
} from "./generated/api-contract";

export const apiContract = contract;
export type {
  CreateRunRequest,
  CreateRunResponse,
  Customer,
  CustomerInput,
  CustomerListResponse,
  DecisionRequest,
  Order,
  OrderInput,
  OrderListResponse,
  Product,
  ProductInput,
  ProductListResponse,
  ProposedRefund,
  RunListResponse,
  RunStatus,
  StructuredExtraction,
  SupportRoute,
  SupportRun,
};

export type DecisionResponse = SupportRun;

export interface SupportApi {
  createRun(request: CreateRunRequest): Promise<CreateRunResponse>;
  getRun(runId: string): Promise<SupportRun>;
  listRuns(status?: RunStatus, limit?: number, offset?: number): Promise<RunListResponse>;
  decideRun(runId: string, request: DecisionRequest): Promise<DecisionResponse>;
  listCustomers(): Promise<CustomerListResponse>;
  createCustomer(request: CustomerInput): Promise<Customer>;
  updateCustomer(id: number, request: CustomerInput): Promise<Customer>;
  deleteCustomer(id: number): Promise<void>;
  listProducts(): Promise<ProductListResponse>;
  createProduct(request: ProductInput): Promise<Product>;
  updateProduct(id: number, request: ProductInput): Promise<Product>;
  deleteProduct(id: number): Promise<void>;
  listOrders(): Promise<OrderListResponse>;
  createOrder(request: OrderInput): Promise<Order>;
  updateOrder(id: number, request: OrderInput): Promise<Order>;
  deleteOrder(id: number): Promise<void>;
}
