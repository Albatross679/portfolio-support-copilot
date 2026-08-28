import json
from contextlib import asynccontextmanager
from types import SimpleNamespace
from typing import Any

import pytest

from support_copilot.api import decide_run
from support_copilot.schemas import DecisionRequest
from support_copilot.worker import run_agent


class FakeRedis:
    def __init__(self, run: dict[str, Any]) -> None:
        self.values = {f"run:{run['run_id']}": json.dumps(run)}
        self.enqueued: list[tuple[Any, ...]] = []
        self.enqueue_error: Exception | None = None

    async def get(self, key: str) -> str | None:
        return self.values.get(key)

    async def set(self, key: str, value: str) -> None:
        self.values[key] = value

    async def enqueue_job(self, *args: Any, **kwargs: Any) -> object:
        if self.enqueue_error:
            raise self.enqueue_error
        self.enqueued.append((*args, kwargs))
        return object()

    @asynccontextmanager
    async def lock(self, *args: Any, **kwargs: Any):
        yield


@pytest.mark.asyncio
async def test_failed_decision_enqueue_leaves_run_retryable() -> None:
    run = {
        "run_id": "run-1",
        "thread_id": "thread-1",
        "status": "awaiting_approval",
        "proposed_refund": {
            "order_number": "ORD-1001",
            "amount_cents": 2999,
            "currency": "USD",
            "reason": "damaged_disc",
        },
    }
    redis = FakeRedis(run)
    redis.enqueue_error = RuntimeError("queue unavailable")

    with pytest.raises(RuntimeError, match="queue unavailable"):
        await decide_run("run-1", DecisionRequest(decision="approve"), redis)

    stored = json.loads(redis.values["run:run-1"])
    assert stored["status"] == "awaiting_approval"


@pytest.mark.asyncio
async def test_new_thread_run_clears_values_from_previous_run() -> None:
    snapshots = [
        SimpleNamespace(values={"answer": "old", "proposed_refund": {"amount_cents": 1}}, tasks=[]),
        SimpleNamespace(
            values={"run_id": "run-2", "answer": "new", "proposed_refund": None},
            tasks=[],
        ),
    ]

    class FakeGraph:
        def __init__(self) -> None:
            self.input: dict[str, Any] | None = None

        async def aget_state(self, config: dict[str, Any]) -> Any:
            return snapshots.pop(0)

        async def ainvoke(self, state: dict[str, Any], config: dict[str, Any]) -> None:
            self.input = state

    graph = FakeGraph()
    redis = FakeRedis({"run_id": "run-2", "thread_id": "thread-1", "status": "queued"})
    result = await run_agent(
        {"redis": redis, "graph": graph},
        "run-2",
        "new question",
        "thread-1",
    )

    assert graph.input is not None
    assert graph.input["answer"] is None
    assert graph.input["proposed_refund"] is None
    assert result == {"answer": "new"}
