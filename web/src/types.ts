import contract from "../api-contract.json";
import type {
  CreateRunRequest,
  CreateRunResponse,
  CustomerIdentificationRequest,
  CustomerIdentificationResponse,
  CustomerIdentity,
  CustomerOrder,
  CustomerOrderList,
  DecisionRequest,
  RunListResponse,
  RunStatus,
  SupportRun,
} from "./generated/api-contract";

export const apiContract = contract;
export type {
  CreateRunRequest,
  CreateRunResponse,
  CustomerIdentificationRequest,
  CustomerIdentificationResponse,
  CustomerIdentity,
  CustomerOrder,
  CustomerOrderList,
  DecisionRequest,
  ProposedRefund,
  RunListResponse,
  RunStatus,
  StructuredExtraction,
  SupportRoute,
  SupportRun,
} from "./generated/api-contract";

export type DecisionResponse = SupportRun;

export interface SupportApi {
  createRun(request: CreateRunRequest): Promise<CreateRunResponse>;
  getRun(runId: string): Promise<SupportRun>;
  listRuns(status?: RunStatus): Promise<RunListResponse>;
  decideRun(runId: string, request: DecisionRequest): Promise<DecisionResponse>;
  identifyCustomer(request: CustomerIdentificationRequest): Promise<CustomerIdentificationResponse>;
  listCustomerOrders(customer: CustomerIdentity): Promise<CustomerOrderList>;
  getCustomerRun(customer: CustomerIdentity, runId: string): Promise<SupportRun>;
}
