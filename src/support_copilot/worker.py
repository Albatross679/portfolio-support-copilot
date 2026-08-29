import asyncio
import json
import logging
from typing import Any

from arq.connections import RedisSettings, create_pool
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.types import Command
from psycopg_pool import AsyncConnectionPool

from support_copilot.config import get_settings
from support_copilot.db import StoreRepository
from support_copilot.graph import GraphDependencies, build_graph
from support_copilot.model import OpenRouterClient

logger = logging.getLogger(__name__)
settings = get_settings()
JOB_TIMEOUT_SECONDS = 500
THREAD_LOCK_TIMEOUT_SECONDS = JOB_TIMEOUT_SECONDS + 30
THREAD_LOCK_BLOCKING_TIMEOUT_SECONDS = 180


async def startup(ctx: dict[str, Any]) -> None:
    pool = AsyncConnectionPool(
        settings.database_url, min_size=2, max_size=10, open=False, kwargs={"autocommit": True}
    )
    await pool.open()
    redis = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    model = OpenRouterClient(settings)
    saver = AsyncPostgresSaver(pool)
    ctx.update(
        pool=pool,
        redis=redis,
        model=model,
        graph=build_graph(GraphDependencies(model, StoreRepository(pool), redis), saver),
    )


async def shutdown(ctx: dict[str, Any]) -> None:
    await ctx["model"].close()
    await ctx["redis"].aclose()
    await ctx["pool"].close()


async def write_status(redis: Any, run_id: str, **update: Any) -> None:
    key = f"run:{run_id}"
    existing = await redis.get(key)
    data = (
        json.loads(existing.decode() if isinstance(existing, bytes) else existing)
        if existing
        else {"run_id": run_id}
    )
    data.update(update)
    await redis.set(key, json.dumps(data, default=str))


def state_payload(snapshot: Any) -> dict[str, Any]:
    values = snapshot.values
    payload = {
        key: values[key]
        for key in ("extraction", "proposed_refund", "answer")
        if values.get(key) is not None
    }
    if values.get("routing") is not None:
        payload["route"] = values["routing"]
    return payload


def interrupt_payload(snapshot: Any) -> dict[str, Any]:
    for task in snapshot.tasks:
        if task.interrupts:
            value = task.interrupts[0].value
            return value if isinstance(value, dict) else {}
    return {}


async def run_agent(
    ctx: dict[str, Any], run_id: str, message: str, thread_id: str
) -> dict[str, Any]:
    config = {"configurable": {"thread_id": thread_id}}
    try:
        async with ctx["redis"].lock(
            f"thread-lock:{thread_id}",
            timeout=THREAD_LOCK_TIMEOUT_SECONDS,
            blocking_timeout=THREAD_LOCK_BLOCKING_TIMEOUT_SECONDS,
        ):
            previous = await ctx["graph"].aget_state(config)
            if interrupt_payload(previous):
                raise ValueError("Thread already has a run awaiting approval")
            await write_status(ctx["redis"], run_id, status="running")
            initial_state = {
                "run_id": run_id,
                "message": message,
                "extraction": None,
                "routing": None,
                "handler": None,
                "tool_context": None,
                "sources": None,
                "proposed_refund": None,
                "decision": None,
                "answer": None,
                "conversation_history": [{"role": "user", "content": message}],
            }
            await ctx["graph"].ainvoke(initial_state, config=config)
            snapshot = await ctx["graph"].aget_state(config)
            payload = interrupt_payload(snapshot)
            if payload:
                await write_status(
                    ctx["redis"],
                    run_id,
                    status="awaiting_approval",
                    **{
                        **state_payload(snapshot),
                        "proposed_refund": payload.get("proposed_refund"),
                    },
                )
                return {"status": "awaiting_approval"}
            payload = state_payload(snapshot)
            await write_status(ctx["redis"], run_id, status="completed", **payload)
            return payload
    except asyncio.CancelledError:
        logger.warning("run %s was cancelled", run_id)
        await write_status(
            ctx["redis"], run_id, status="failed", error="Job cancelled before completion"
        )
        raise
    except Exception as error:
        logger.exception("run %s failed", run_id)
        await write_status(ctx["redis"], run_id, status="failed", error=str(error))
        raise


async def resume_agent(
    ctx: dict[str, Any], run_id: str, thread_id: str, decision: str
) -> dict[str, Any]:
    config = {"configurable": {"thread_id": thread_id}}
    try:
        async with ctx["redis"].lock(
            f"thread-lock:{thread_id}",
            timeout=THREAD_LOCK_TIMEOUT_SECONDS,
            blocking_timeout=THREAD_LOCK_BLOCKING_TIMEOUT_SECONDS,
        ):
            paused = await ctx["graph"].aget_state(config)
            if paused.values.get("run_id") != run_id or not interrupt_payload(paused):
                raise ValueError("Run does not own the paused thread checkpoint")
            await write_status(ctx["redis"], run_id, status="running")
            await ctx["graph"].ainvoke(Command(resume=decision), config=config)
            snapshot = await ctx["graph"].aget_state(config)
            payload = state_payload(snapshot)
            await write_status(ctx["redis"], run_id, status="completed", **payload)
            return payload
    except asyncio.CancelledError:
        logger.warning("resume %s was cancelled", run_id)
        await write_status(
            ctx["redis"], run_id, status="failed", error="Job cancelled before completion"
        )
        raise
    except Exception as error:
        logger.exception("resume %s failed", run_id)
        await write_status(ctx["redis"], run_id, status="failed", error=str(error))
        raise


class WorkerSettings:
    functions = [run_agent, resume_agent]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    job_timeout = JOB_TIMEOUT_SECONDS
    max_tries = 1
