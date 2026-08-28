import json
import re
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from psycopg import AsyncConnection
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from support_copilot.schemas import RefundProposal

WRITE_SQL = re.compile(
    r"\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|call|do|vacuum)\b", re.IGNORECASE
)
ALLOWED_TABLES = {"customers", "products", "orders"}


class StoreRepository:
    def __init__(self, pool: AsyncConnectionPool) -> None:
        self.pool = pool

    async def retrieve(self, embedding: list[float], limit: int = 4) -> list[dict[str, Any]]:
        async with self.pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(
                    """
                    SELECT document_name, content, metadata,
                           1 - (embedding <=> %s::vector) AS similarity
                    FROM help_document_embeddings
                    ORDER BY embedding <=> %s::vector
                    LIMIT %s
                    """,
                    (vector_literal(embedding), vector_literal(embedding), limit),
                )
                return list(await cur.fetchall())

    async def query_readonly(self, sql: str) -> list[dict[str, Any]]:
        validate_readonly_sql(sql)
        async with self.pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(sql)
                return list(await cur.fetchall())

    async def refund_proposal(self, order_number: str | None, reason: str) -> RefundProposal:
        if not order_number:
            return RefundProposal(order_number="unknown", amount_cents=0, reason=f"{reason}; order number required")
        async with self.pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(
                    """
                    SELECT o.order_number, o.quantity * p.price_cents AS amount_cents
                    FROM orders o JOIN products p ON p.id = o.product_id
                    WHERE o.order_number = %s
                    """,
                    (order_number,),
                )
                row = await cur.fetchone()
        if row is None:
            return RefundProposal(order_number=order_number, amount_cents=0, reason=f"{reason}; order not found")
        return RefundProposal(order_number=row["order_number"], amount_cents=row["amount_cents"], reason=reason)

    async def record_simulated_refund(self, proposal: RefundProposal, approved: bool) -> None:
        if proposal.order_number == "unknown":
            return
        async with self.pool.connection() as conn:
            await conn.execute(
                "UPDATE orders SET refund_status = %s WHERE order_number = %s",
                ("approved" if approved else "rejected", proposal.order_number),
            )
            await conn.commit()


def vector_literal(values: Sequence[float]) -> str:
    return "[" + ",".join(str(value) for value in values) + "]"


def validate_readonly_sql(sql: str) -> None:
    normalized = sql.strip()
    if not normalized.lower().startswith(("select", "with")):
        raise ValueError("Only SELECT queries are permitted")
    if ";" in normalized.rstrip(";") or WRITE_SQL.search(normalized):
        raise ValueError("Write SQL is not permitted")
    referenced = set(re.findall(r"\b(?:from|join)\s+([a-z_]+)", normalized, flags=re.IGNORECASE))
    if not referenced or not referenced.issubset(ALLOWED_TABLES):
        raise ValueError("Query must reference only business tables")


async def apply_schema(conn: AsyncConnection[Any]) -> None:
    schema_path = Path(__file__).with_name("schema.sql")
    await conn.execute(schema_path.read_text())
    await conn.commit()


def encode_run(value: dict[str, Any]) -> str:
    return json.dumps(value, default=str)
