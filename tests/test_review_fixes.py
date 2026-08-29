import asyncio
import json
from contextlib import asynccontextmanager
from pathlib import Path
from types import NoneType, SimpleNamespace, UnionType
from typing import Any, Literal, get_args, get_origin

import pytest
from fastapi import HTTPException
from pydantic import BaseModel

from support_copilot.api import decide_run, get_run, list_runs
from support_copilot.ingest import find_help_directory
from support_copilot.model import strict_json_schema
from support_copilot.schemas import (
    DecisionRequest,
    Extraction,
    RefundProposal,
    RouteDecision,
    RunCreated,
    RunList,
    RunRequest,
    RunState,
    RunStatus,
)
from support_copilot.worker import THREAD_LOCK_TIMEOUT_SECONDS, WorkerSettings, run_agent


class FakeRedis:
    def __init__(self, run: dict[str, Any]) -> None:
        self.values = {f"run:{run['run_id']}": json.dumps(run)}
        self.enqueued: list[tuple[Any, ...]] = []
        self.enqueue_error: Exception | None = None
        self.enqueue_result: object | None = object()

    async def get(self, key: str) -> str | None:
        return self.values.get(key)

    async def set(self, key: str, value: str) -> None:
        self.values[key] = value

    async def enqueue_job(self, *args: Any, **kwargs: Any) -> object:
        if self.enqueue_error:
            raise self.enqueue_error
        self.enqueued.append((*args, kwargs))
        return self.enqueue_result

    async def scan_iter(self, *, match: str) -> Any:
        assert match == "run:*"
        for key in self.values:
            yield key

    @asynccontextmanager
    async def lock(self, *args: Any, **kwargs: Any):
        yield


CONTRACT_MODEL_NAMES = {
    Extraction: "StructuredExtraction",
    RouteDecision: "SupportRoute",
    RefundProposal: "ProposedRefund",
    RunStatus: "SupportRun",
    RunRequest: "CreateRunRequest",
    RunCreated: "CreateRunResponse",
    DecisionRequest: "DecisionRequest",
    RunList: "RunListResponse",
}


def contract_type(annotation: Any) -> Any:
    if annotation is RunState:
        return {"ref": "RunStatus"}
    origin = get_origin(annotation)
    arguments = get_args(annotation)
    if origin is Literal:
        return {"enum": list(arguments)}
    if origin is UnionType:
        non_null = [argument for argument in arguments if argument is not NoneType]
        assert len(non_null) == 1 and len(arguments) == 2
        return {"nullable": contract_type(non_null[0])}
    if origin is list:
        return {"array": contract_type(arguments[0])}
    if isinstance(annotation, type) and issubclass(annotation, BaseModel):
        return {"ref": CONTRACT_MODEL_NAMES[annotation]}
    return {str: "string", int: "integer"}[annotation]


def contract_model(model: type[BaseModel]) -> dict[str, Any]:
    return {
        "properties": {
            name: contract_type(field.annotation) for name, field in model.model_fields.items()
        },
        "required": [name for name, field in model.model_fields.items() if field.is_required()],
    }


def test_shared_api_contract_matches_backend_models() -> None:
    contract_path = Path(__file__).parents[1] / "web" / "api-contract.json"
    contract = json.loads(contract_path.read_text())

    expected_types = {
        "RunStatus": {"enum": list(get_args(RunState.__value__))},
        **{
            frontend_name: contract_model(model)
            for model, frontend_name in CONTRACT_MODEL_NAMES.items()
        },
    }

    assert contract["types"] == expected_types


@pytest.mark.asyncio
async def test_run_browser_navigation_returns_console(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    console_dist = tmp_path / "dist"
    console_dist.mkdir()
    (console_dist / "index.html").write_text("<main>Support Copilot</main>")
    monkeypatch.setattr("support_copilot.api.CONSOLE_DIST", console_dist)
    request = SimpleNamespace(headers={"accept": "text/html,application/xhtml+xml"})

    response = await get_run("run-1", request, FakeRedis({"run_id": "run-1"}))

    assert response.media_type == "text/html"
    assert Path(response.path).name == "index.html"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["vary"] == "Accept"


def test_openrouter_strict_schema_requires_every_property() -> None:
    schema = strict_json_schema(Extraction)

    assert schema["required"] == list(schema["properties"])
    assert schema["additionalProperties"] is False
    assert all(
        "default" not in property_schema for property_schema in schema["properties"].values()
    )


def test_help_documents_are_found_from_the_process_working_directory(
    tmp_path: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    help_directory = tmp_path / "docs" / "help"
    help_directory.mkdir(parents=True)
    (help_directory / "returns.md").write_text("Return policy")
    monkeypatch.chdir(tmp_path)

    assert find_help_directory() == help_directory


def test_thread_lock_outlives_worker_job_timeout() -> None:
    assert THREAD_LOCK_TIMEOUT_SECONDS > WorkerSettings.job_timeout


@pytest.mark.asyncio
async def test_list_runs_filters_awaiting_approval() -> None:
    paused = {
        "run_id": "run-paused",
        "thread_id": "thread-1",
        "status": "awaiting_approval",
        "proposed_refund": {
            "order_number": "ORD-1001",
            "amount_cents": 2999,
            "currency": "USD",
            "reason": "damaged_disc",
        },
    }
    redis = FakeRedis(paused)
    redis.values["run:run-completed"] = json.dumps(
        {"run_id": "run-completed", "thread_id": "thread-2", "status": "completed"}
    )

    result = await list_runs("awaiting_approval", redis)

    assert [run.run_id for run in result.runs] == ["run-paused"]
    assert result.runs[0].proposed_refund is not None
    assert result.runs[0].proposed_refund.amount_cents == 2999


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
async def test_duplicate_decision_is_rejected() -> None:
    run = {"run_id": "run-1", "thread_id": "thread-1", "status": "awaiting_approval"}
    redis = FakeRedis(run)
    redis.enqueue_result = None

    with pytest.raises(HTTPException) as error:
        await decide_run("run-1", DecisionRequest(decision="reject"), redis)

    assert error.value.status_code == 409
    assert error.value.detail == "A decision is already queued"


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


@pytest.mark.asyncio
async def test_cancelled_run_is_recorded_as_failed() -> None:
    class CancelledGraph:
        async def aget_state(self, config: dict[str, Any]) -> Any:
            return SimpleNamespace(values={}, tasks=[])

        async def ainvoke(self, state: dict[str, Any], config: dict[str, Any]) -> None:
            raise asyncio.CancelledError

    redis = FakeRedis({"run_id": "run-3", "thread_id": "thread-3", "status": "queued"})

    with pytest.raises(asyncio.CancelledError):
        await run_agent(
            {"redis": redis, "graph": CancelledGraph()},
            "run-3",
            "question",
            "thread-3",
        )

    stored = json.loads(redis.values["run:run-3"])
    assert stored["status"] == "failed"
    assert stored["error"] == "Job cancelled before completion"
