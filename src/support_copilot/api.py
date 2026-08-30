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
from psycopg_pool import AsyncConnectionPool

from support_copilot.config import get_settings
from support_copilot.db import StoreRepository
from support_copilot.schemas import (
    CustomerIdentificationRequest,
    CustomerIdentificationResponse,
    CustomerOrderList,
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
    app.state.pool = AsyncConnectionPool(
        settings.database_url, min_size=1, max_size=5, open=False, kwargs={"autocommit": True}
    )
    await app.state.pool.open()
    app.state.repository = StoreRepository(app.state.pool)
    yield
    await app.state.redis.aclose()
    await app.state.pool.close()


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


def store_repository(request: Request) -> StoreRepository:
    return request.app.state.repository


async def read_run(redis: Any, run_id: str) -> dict[str, Any]:
    value = await redis.get(f"run:{run_id}")
    if value is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    return json.loads(value.decode() if isinstance(value, bytes) else value)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/customers/identify", response_model=CustomerIdentificationResponse)
async def identify_customer(
    payload: CustomerIdentificationRequest, repository: StoreRepository = Depends(store_repository)
) -> CustomerIdentificationResponse:
    return CustomerIdentificationResponse(
        customer=await repository.identify_customer(payload.name, payload.email)
    )


async def require_customer(
    customer_id: int, name: str, email: str, repository: StoreRepository
) -> None:
    customer = await repository.identify_customer(name, email)
    if customer is None or customer.id != customer_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")


@app.get("/customers/{customer_id}/orders", response_model=CustomerOrderList)
async def list_customer_orders(
    customer_id: int,
    name: str,
    email: str,
    redis: Any = Depends(redis_client),
    repository: StoreRepository = Depends(store_repository),
) -> CustomerOrderList:
    await require_customer(customer_id, name, email, repository)
    orders = await repository.customer_orders(customer_id)
    awaiting_approval: set[str] = set()
    async for key in redis.scan_iter(match="run:*"):
        run = await read_run(redis, (key.decode() if isinstance(key, bytes) else key).removeprefix("run:"))
        if run.get("status") == "awaiting_approval" and run.get("customer_id") == customer_id:
            order_number = run.get("order_number")
            if order_number:
                awaiting_approval.add(order_number)
    return CustomerOrderList(
        orders=[
            order.model_copy(
                update={"refund_progress": "awaiting_approval"}
                if order.order_number in awaiting_approval and order.refund_progress == "none"
                else {}
            )
            for order in orders
        ]
    )


@app.post("/runs", response_model=RunCreated, status_code=status.HTTP_202_ACCEPTED)
async def create_run(
    payload: RunRequest,
    redis: Any = Depends(redis_client),
    repository: StoreRepository = Depends(store_repository),
) -> RunCreated:
    customer_id: int | None = None
    if payload.customer:
        await require_customer(
            payload.customer.id, payload.customer.name, payload.customer.email, repository
        )
        customer_id = payload.customer.id
        if payload.order_number and not await repository.customer_owns_order(
            customer_id, payload.order_number
        ):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Order not found")
    elif payload.order_number:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="An order selection requires a customer identity",
        )
    run_id = str(uuid.uuid4())
    thread_id = payload.thread_id or str(uuid.uuid4())
    await redis.set(
        f"run:{run_id}",
        json.dumps(
            {
                "run_id": run_id,
                "thread_id": thread_id,
                "status": "queued",
                "customer_id": customer_id,
                "order_number": payload.order_number,
            }
        ),
    )
    await redis.enqueue_job(
        "run_agent",
        run_id,
        payload.message,
        thread_id,
        customer_id,
        payload.order_number,
        _job_id=run_id,
    )
    return RunCreated(run_id=run_id, thread_id=thread_id)


@app.get("/customers/{customer_id}/runs/{run_id}", response_model=RunStatus)
async def get_customer_run(
    customer_id: int,
    run_id: str,
    name: str,
    email: str,
    redis: Any = Depends(redis_client),
    repository: StoreRepository = Depends(store_repository),
) -> RunStatus:
    await require_customer(customer_id, name, email, repository)
    run = await read_run(redis, run_id)
    if run.get("customer_id") != customer_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    return RunStatus.model_validate(run)


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
async def get_run(
    run_id: str, request: Request, redis: Any = Depends(redis_client)
) -> RunStatus | FileResponse:
    if "text/html" in request.headers.get("accept", "") and CONSOLE_DIST.is_dir():
        return FileResponse(
            CONSOLE_DIST / "index.html",
            headers={"Cache-Control": "no-store", "Vary": "Accept"},
        )
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
