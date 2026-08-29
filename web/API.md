# API contract

The Compose console and API share one origin. In Vite development, leave `VITE_API_BASE` blank to send `/api` requests through the development proxy, or set it to a local API origin such as `http://localhost:8000`; the API permits local Vite origins.

## Create a run

`POST /runs` accepts `{ "message": "customer support text", "thread_id": "optional existing thread" }` and returns `{ "run_id": "string", "thread_id": "string" }` immediately. Work continues asynchronously.

## Read a run

`GET /runs/{run_id}` returns a run object with `run_id`, `thread_id`, and `status`, plus `extraction`, `route`, `answer`, and `proposed_refund` once available. `status` is one of `queued`, `running`, `awaiting_approval`, `completed`, or `failed`. `extraction` contains nullable `order_number` and `product_title` fields. It also contains enum-valued `media_format`, `issue_type`, and `sentiment` fields. `route` is `{ "lane", "handler", "rationale" }`; the handler is `rag`, `sql`, or `refund`. An `awaiting_approval` run includes `proposed_refund` with `order_number`, integer `amount_cents`, ISO `currency`, and `reason`.

## List paused runs

`GET /runs?status=awaiting_approval` returns `{ "runs": [Run] }`. This is the approval inbox endpoint.

## Decide a refund

`POST /runs/{run_id}/decision` accepts `{ "decision": "approve" }` or `{ "decision": "reject" }`, enqueues a resume job, and returns the current run object with `202`. Poll `GET /runs/{run_id}` until it is completed to read its `answer`.

The shared field inventory is in [`api-contract.json`](api-contract.json). Backend tests compare it to the Pydantic response models, and console types derive their field names and statuses from it.
