import hashlib
import json
from typing import Any, Literal, Protocol, TypedDict

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt

from support_copilot.db import StoreRepository
from support_copilot.schemas import Extraction, RouteDecision, SqlPlan


class ModelClient(Protocol):
    async def structured(self, schema: type[Any], system: str, user: str) -> Any: ...

    async def generate(self, system: str, user: str) -> str: ...

    async def embed(self, texts: list[str]) -> list[list[float]]: ...


class CacheClient(Protocol):
    async def get(self, key: str) -> bytes | str | None: ...

    async def set(self, key: str, value: str, *, ex: int | None = None) -> Any: ...


class SupportState(TypedDict, total=False):
    message: str
    extraction: dict[str, Any]
    routing: dict[str, Any]
    handler: Literal["rag", "sql", "refund"]
    tool_context: str
    sources: list[str]
    proposed_refund: dict[str, Any]
    decision: Literal["approve", "reject"]
    answer: str


class GraphDependencies:
    def __init__(self, model: ModelClient, repository: StoreRepository, cache: CacheClient) -> None:
        self.model = model
        self.repository = repository
        self.cache = cache


def build_nodes(deps: GraphDependencies) -> dict[str, Any]:
    async def extract(state: SupportState) -> dict[str, Any]:
        extraction = await deps.model.structured(
            Extraction,
            "Extract store-support fields. Do not invent an order number or title. Use only the fixed enum values.",
            state["message"],
        )
        return {"extraction": extraction.model_dump()}

    async def route(state: SupportState) -> dict[str, Any]:
        extraction = json.dumps(state["extraction"])
        decision = await deps.model.structured(
            RouteDecision,
            """Classify a physical-media support message. Use refund only when the customer explicitly requests a refund or a damaged/missing item needs a refund review. Use sql only for aggregate or store-data questions such as sales counts. Use rag for every policy or order-support question. lane is billing, shipping, returns, or general.""",
            f"Message: {state['message']}\nExtraction: {extraction}",
        )
        return {"routing": decision.model_dump(), "handler": decision.handler}

    async def rag(state: SupportState) -> dict[str, Any]:
        vector = (await deps.model.embed([state["message"]]))[0]
        documents = await deps.repository.retrieve(vector)
        context = "\n\n".join(f"[{doc['document_name']}] {doc['content']}" for doc in documents)
        return {"tool_context": context or "No help document was retrieved.", "sources": [doc["document_name"] for doc in documents]}

    async def sql(state: SupportState) -> dict[str, Any]:
        plan = await deps.model.structured(
            SqlPlan,
            """Write one PostgreSQL SELECT query for the physical-media store. Available tables are customers(id, email, name), products(id, title, format, sku, price_cents), and orders(order_number, customer_id, product_id, quantity, ordered_at, status, refund_status). Never write data. Use current_date for relative dates.""",
            state["message"],
        )
        cache_key = "tool:sql:" + hashlib.sha256(plan.sql.encode()).hexdigest()
        cached = await deps.cache.get(cache_key)
        if cached is None:
            rows = await deps.repository.query_readonly(plan.sql)
            await deps.cache.set(cache_key, json.dumps(rows, default=str), ex=300)
        else:
            rows = json.loads(cached.decode() if isinstance(cached, bytes) else cached)
        return {"tool_context": json.dumps(rows, default=str), "sources": ["business database"]}

    async def refund(state: SupportState) -> dict[str, Any]:
        extraction = Extraction.model_validate(state["extraction"])
        proposal = await deps.repository.refund_proposal(extraction.order_number, extraction.issue_type)
        decision = interrupt({"proposed_refund": proposal.model_dump()})
        approved = decision == "approve"
        await deps.repository.record_simulated_refund(proposal, approved)
        return {
            "proposed_refund": proposal.model_dump(),
            "decision": "approve" if approved else "reject",
            "tool_context": "The simulated refund was approved." if approved else "The simulated refund was rejected.",
            "sources": ["fake business data"],
        }

    async def respond(state: SupportState) -> dict[str, Any]:
        response = await deps.model.generate(
            "Answer as a concise store support copilot. Use only the supplied evidence. If a refund was rejected, say so plainly. Never claim a real payment was issued.",
            "\n".join(
                [
                    f"Customer message: {state['message']}",
                    f"Route: {state['routing']}",
                    f"Evidence: {state.get('tool_context', '')}",
                ]
            ),
        )
        return {"answer": response}

    return {"extract": extract, "route": route, "rag": rag, "sql": sql, "refund": refund, "respond": respond}


def choose_handler(state: SupportState) -> Literal["rag", "sql", "refund"]:
    return state["handler"]


def build_graph(deps: GraphDependencies, checkpointer: BaseCheckpointSaver[Any] | None = None) -> Any:
    nodes = build_nodes(deps)
    builder = StateGraph(SupportState)
    for name, node in nodes.items():
        builder.add_node(name, node)
    builder.add_edge(START, "extract")
    builder.add_edge("extract", "route")
    builder.add_conditional_edges("route", choose_handler, {"rag": "rag", "sql": "sql", "refund": "refund"})
    for handler in ("rag", "sql", "refund"):
        builder.add_edge(handler, "respond")
    builder.add_edge("respond", END)
    return builder.compile(checkpointer=checkpointer)
