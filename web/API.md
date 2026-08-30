# API contract

The Compose console and API share one origin. In Vite development, leave `VITE_API_BASE` blank to send `/api` requests through the development proxy, or set it to a local API origin such as `http://localhost:8000`; the API permits local Vite origins.

## Identify a customer

`POST /customers/identify` accepts `{ "name": "Maya Chen", "email": "maya@example.test" }` and returns `{ "customer": { "id", "name", "email" } }` when the pair matches a row in `customers`; it returns `{ "customer": null }` when it does not. This is a lookup, not authentication.

## Read customer orders

`GET /customers/{customer_id}/orders?name=Maya%20Chen&email=maya%40example.test` returns `{ "orders": [...] }` for the matching customer. Each order has `order_number`, `title`, `media_format`, `quantity`, `ordered_at`, `status`, and `refund_progress`. `refund_progress` is `none`, `awaiting_approval`, `approved`, or `rejected`; paused refund runs supply `awaiting_approval` while the order table supplies the final states.

## Create a run

`POST /runs` accepts `{ "message": "customer support text", "thread_id": "optional existing thread", "customer": { "id", "name", "email" }, "order_number": "optional selected order" }` and returns `{ "run_id": "string", "thread_id": "string" }` immediately. Customer submissions include the matched customer identity and optionally one of that customer's orders; a general question omits `order_number`. Work continues asynchronously.

## Read a run

`GET /customers/{customer_id}/runs/{run_id}?name=Maya%20Chen&email=maya%40example.test` reads a customer-submitted run after confirming the same lookup pair and customer id. `GET /runs/{run_id}` remains available for the employee console. Both return a run object with `run_id`, `thread_id`, and `status`, plus `extraction`, `route`, `answer`, and `proposed_refund` once available. `status` is one of `queued`, `running`, `awaiting_approval`, `completed`, or `failed`. `extraction` contains nullable `order_number` and `product_title` fields. It also contains enum-valued `media_format`, `issue_type`, and `sentiment` fields. `route` is `{ "lane", "handler", "rationale" }`; the handler is `rag`, `sql`, or `refund`. An `awaiting_approval` run includes `proposed_refund` with `order_number`, integer `amount_cents`, ISO `currency`, and `reason`.

## List paused runs

`GET /runs?status=awaiting_approval` returns `{ "runs": [Run] }`. This is the approval inbox endpoint.

## Decide a refund

`POST /runs/{run_id}/decision` accepts `{ "decision": "approve" }` or `{ "decision": "reject" }`, enqueues a resume job, and returns the current run object with `202`. Poll `GET /runs/{run_id}` until it is completed to read its `answer`.

The shared field inventory is in [`api-contract.json`](api-contract.json). Backend tests compare it to the Pydantic response models, and console types derive their field names and statuses from it.
