import json
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from psycopg import AsyncConnection
from psycopg import sql as psycopg_sql
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool
from sqlglot import exp, parse
from sqlglot.errors import ParseError
from sqlglot.optimizer.scope import traverse_scope

from support_copilot.schemas import RefundProposal

ALLOWED_TABLES = {"customers", "products", "orders"}
ALLOWED_FUNCTIONS = {
    "avg",
    "coalesce",
    "count",
    "current_date",
    "date_trunc",
    "extract",
    "lower",
    "max",
    "min",
    "round",
    "sum",
    "timestamp_trunc",
    "upper",
}


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
            async with conn.transaction():
                await conn.execute("SET TRANSACTION READ ONLY")
                await conn.execute("SET LOCAL ROLE support_copilot_reader")
                await conn.execute("SET LOCAL statement_timeout = '5s'")
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
    try:
        statements = parse(normalized, read="postgres")
    except ParseError as error:
        raise ValueError("SQL could not be parsed") from error
    if len(statements) != 1 or not isinstance(statements[0], exp.Query):
        raise ValueError("Only SELECT queries are permitted")
    statement = statements[0]
    tables = [
        source
        for scope in traverse_scope(statement)
        for source in scope.sources.values()
        if isinstance(source, exp.Table)
    ]
    if not tables or any(table.catalog or table.db or table.name.lower() not in ALLOWED_TABLES for table in tables):
        raise ValueError("Query must reference only business tables")
    if any(isinstance(dot.expression, exp.Func) for dot in statement.find_all(exp.Dot)):
        raise ValueError("Schema-qualified functions are not permitted")
    functions = called_function_names(statement)
    if not functions.issubset(ALLOWED_FUNCTIONS):
        raise ValueError("Query contains a function that is not permitted")


def called_function_names(statement: exp.Query) -> set[str]:
    names: set[str] = set()
    for function in statement.find_all(exp.Func):
        name = function_name(function)
        if isinstance(function, exp.CurrentDate) or function.sql().lower().lstrip().startswith(f"{name}("):
            names.add(name)
    return names


def function_name(function: exp.Func) -> str:
    if isinstance(function, exp.Anonymous):
        return function.name.lower()
    return function.sql_name().lower()


async def apply_schema(conn: AsyncConnection[Any], embedding_dim: int) -> None:
    schema_path = Path(__file__).with_name("schema.sql")
    schema = schema_path.read_text().replace("{{EMBEDDING_DIM}}", str(embedding_dim))
    await conn.execute(schema)
    if embedding_dim <= 2000:
        await conn.execute(
            psycopg_sql.SQL(
                "CREATE INDEX IF NOT EXISTS help_document_embeddings_embedding_idx "
                "ON help_document_embeddings USING ivfflat "
                "(embedding vector_cosine_ops) WITH (lists = 10)"
            )
        )
    await conn.commit()


def encode_run(value: dict[str, Any]) -> str:
    return json.dumps(value, default=str)
