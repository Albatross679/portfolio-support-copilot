import json
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from arq.connections import RedisSettings, create_pool
from fastapi import Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from support_copilot.config import get_settings
from support_copilot.schemas import (
    DecisionRequest,
    RunCreated,
    RunList,
    RunRequest,
    RunState,
    RunStatus,
)

settings = get_settings()
CONSOLE_DIST = Path.cwd() / "web" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.redis = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    yield
    await app.state.redis.aclose()


app = FastAPI(title="Portfolio Support Copilot", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


def redis_client(request: Request) -> Any:
    return request.app.state.redis


async def read_run(redis: Any, run_id: str) -> dict[str, Any]:
    value = await redis.get(f"run:{run_id}")
    if value is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    return json.loads(value.decode() if isinstance(value, bytes) else value)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/runs", response_model=RunCreated, status_code=status.HTTP_202_ACCEPTED)
async def create_run(payload: RunRequest, redis: Any = Depends(redis_client)) -> RunCreated:
    run_id = str(uuid.uuid4())
    thread_id = payload.thread_id or str(uuid.uuid4())
    await redis.set(
        f"run:{run_id}", json.dumps({"run_id": run_id, "thread_id": thread_id, "status": "queued"})
    )
    await redis.enqueue_job("run_agent", run_id, payload.message, thread_id, _job_id=run_id)
    return RunCreated(run_id=run_id, thread_id=thread_id)


@app.get("/runs", response_model=RunList)
async def list_runs(
    run_status: RunState | None = Query(default=None, alias="status"),
    redis: Any = Depends(redis_client),
) -> RunList:
    runs: list[RunStatus] = []
    async for key in redis.scan_iter(match="run:*"):
        key_text = key.decode() if isinstance(key, bytes) else key
        run = RunStatus.model_validate(await read_run(redis, key_text.removeprefix("run:")))
        if run_status is None or run.status == run_status:
            runs.append(run)
    runs.sort(key=lambda run: run.run_id)
    return RunList(runs=runs)


@app.get("/runs/{run_id}", response_model=RunStatus)
async def get_run(run_id: str, redis: Any = Depends(redis_client)) -> RunStatus:
    return RunStatus.model_validate(await read_run(redis, run_id))


@app.post("/runs/{run_id}/decision", response_model=RunStatus, status_code=status.HTTP_202_ACCEPTED)
async def decide_run(
    run_id: str, payload: DecisionRequest, redis: Any = Depends(redis_client)
) -> RunStatus:
    run = await read_run(redis, run_id)
    if run["status"] != "awaiting_approval":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Run is not awaiting approval"
        )
    job = await redis.enqueue_job(
        "resume_agent",
        run_id,
        run["thread_id"],
        payload.decision,
        _job_id=f"{run_id}:decision",
    )
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="A decision is already queued"
        )
    return RunStatus.model_validate(await read_run(redis, run_id))


if CONSOLE_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=CONSOLE_DIST / "assets"), name="console-assets")

    @app.get("/{path:path}", include_in_schema=False)
    async def console(path: str) -> FileResponse:
        return FileResponse(CONSOLE_DIST / "index.html")
