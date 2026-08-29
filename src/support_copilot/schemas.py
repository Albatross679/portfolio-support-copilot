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


class RunRequest(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    thread_id: str | None = Field(default=None, max_length=255)


class RunCreated(BaseModel):
    run_id: str
    thread_id: str


class DecisionRequest(BaseModel):
    decision: Literal["approve", "reject"]


type RunState = Literal["queued", "running", "awaiting_approval", "completed", "failed"]


class RunStatus(BaseModel):
    run_id: str
    thread_id: str
    status: RunState
    extraction: Extraction | None = None
    route: RouteDecision | None = None
    proposed_refund: RefundProposal | None = None
    answer: str | None = None
    error: str | None = None


class RunList(BaseModel):
    runs: list[RunStatus]
