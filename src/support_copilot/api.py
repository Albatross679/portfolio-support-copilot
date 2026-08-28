import json
import uuid
from contextlib import asynccontextmanager
from typing import Any

from arq.connections import RedisSettings, create_pool
from fastapi import Depends, FastAPI, HTTPException, Request, status

from support_copilot.config import get_settings
from support_copilot.schemas import DecisionRequest, RunCreated, RunRequest, RunStatus

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.redis = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    yield
    await app.state.redis.aclose()


app = FastAPI(title="Portfolio Support Copilot", version="0.1.0", lifespan=lifespan)


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
    await redis.set(f"run:{run_id}", json.dumps({"run_id": run_id, "thread_id": thread_id, "status": "queued"}))
    await redis.enqueue_job("run_agent", run_id, payload.message, thread_id, _job_id=run_id)
    return RunCreated(run_id=run_id, thread_id=thread_id)


@app.get("/runs/{run_id}", response_model=RunStatus)
async def get_run(run_id: str, redis: Any = Depends(redis_client)) -> RunStatus:
    return RunStatus.model_validate(await read_run(redis, run_id))


@app.post("/runs/{run_id}/decision", response_model=RunStatus, status_code=status.HTTP_202_ACCEPTED)
async def decide_run(run_id: str, payload: DecisionRequest, redis: Any = Depends(redis_client)) -> RunStatus:
    run = await read_run(redis, run_id)
    if run["status"] != "awaiting_approval":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Run is not awaiting approval")
    run["status"] = "queued"
    await redis.set(f"run:{run_id}", json.dumps(run))
    await redis.enqueue_job("resume_agent", run_id, run["thread_id"], payload.decision, _job_id=f"{run_id}:decision:{uuid.uuid4()}")
    return RunStatus.model_validate(run)
