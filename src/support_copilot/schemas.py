from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class Extraction(BaseModel):
    order_number: str | None = Field(default=None, description="Store order number, if present")
    product_title: str | None = Field(
        default=None, description="Movie title or box set name, if present"
    )
    media_format: Literal["Blu-ray", "DVD", "4K UHD", "box set", "unknown"] = "unknown"
    issue_type: Literal[
        "billing",
        "shipping",
        "returns",
        "refund",
        "damaged_disc",
        "region_code",
        "preorder",
        "sales_query",
        "general",
    ] = "general"
    sentiment: Literal["positive", "neutral", "frustrated", "angry"] = "neutral"


class RouteDecision(BaseModel):
    lane: Literal["billing", "shipping", "returns", "general"]
    handler: Literal["rag", "sql", "refund"]
    rationale: str


class SqlPlan(BaseModel):
    sql: str = Field(
        description="One read-only PostgreSQL SELECT query against customers, products, or orders"
    )
    explanation: str


class RefundProposal(BaseModel):
    order_number: str
    amount_cents: int
    currency: Literal["USD"] = "USD"
    reason: str


class CustomerIdentity(BaseModel):
    id: int
    name: str
    email: str


class CustomerIdentificationRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: str = Field(min_length=1, max_length=320)


class CustomerIdentificationResponse(BaseModel):
    customer: CustomerIdentity | None = None


type RefundProgress = Literal["none", "awaiting_approval", "approved", "rejected"]


class CustomerOrder(BaseModel):
    order_number: str
    title: str
    media_format: str
    quantity: int
    ordered_at: str
    status: str
    refund_progress: RefundProgress


class CustomerOrderList(BaseModel):
    orders: list[CustomerOrder]


class RunRequest(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    thread_id: str | None = Field(default=None, max_length=255)
    customer: CustomerIdentity | None = None
    order_number: str | None = Field(default=None, max_length=255)


class RunCreated(BaseModel):
    run_id: str
    thread_id: str


class DecisionRequest(BaseModel):
    decision: Literal["approve", "reject"]


class DailyRunLimit(BaseModel):
    daily_run_limit: int = Field(ge=0)


type RunState = Literal["queued", "running", "awaiting_approval", "completed", "failed"]


class RunStatus(BaseModel):
    run_id: str
    thread_id: str
    status: RunState
    created_at: datetime | None = None
    message_preview: str | None = None
    extraction: Extraction | None = None
    route: RouteDecision | None = None
    proposed_refund: RefundProposal | None = None
    answer: str | None = None
    error: str | None = None


class RunList(BaseModel):
    runs: list[RunStatus]
    total: int
    limit: int
    offset: int


class CustomerInput(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    name: str = Field(min_length=1, max_length=200)


class Customer(CustomerInput):
    id: int


class CustomerList(BaseModel):
    customers: list[Customer]


class ProductInput(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    format: Literal["Blu-ray", "DVD", "4K UHD", "box set"]
    sku: str = Field(min_length=1, max_length=100)
    price_cents: int = Field(ge=0)


class Product(ProductInput):
    id: int


class ProductList(BaseModel):
    products: list[Product]


class OrderInput(BaseModel):
    order_number: str = Field(min_length=1, max_length=100)
    customer_id: int = Field(gt=0)
    product_id: int = Field(gt=0)
    quantity: int = Field(gt=0)
    ordered_at: datetime
    status: str = Field(min_length=1, max_length=50)
    refund_status: Literal["none", "approved", "rejected"] = "none"


class Order(OrderInput):
    id: int


class OrderList(BaseModel):
    orders: list[Order]
