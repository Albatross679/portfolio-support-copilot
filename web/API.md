# API contract

The Compose console and API share one origin. In Vite development, leave `VITE_API_BASE` blank to send `/api` requests through the development proxy, or set it to a local API origin such as `http://localhost:8000`; the API permits local Vite origins.

## Runs

`POST /runs` accepts `{ "message": "customer support text", "thread_id": "optional existing thread", "customer": "optional customer identity", "order_number": "optional" }` and returns `{ "run_id": "string", "thread_id": "string" }` immediately. Work continues asynchronously. When the global daily demo budget is exhausted, it returns `429` with `{ "detail": "Daily demo budget is used up, come back tomorrow." }`.

The endpoint accepts messages without `customer` or `order_number`. It returns `429` with `{"detail":"Daily demo budget is used up, come back tomorrow."}` after `DAILY_RUN_LIMIT` runs have been accepted during the current UTC day. A limit of `0` disables this check.

`GET /runs/{run_id}` returns a run object with `run_id`, `thread_id`, `status`, `created_at`, `message_preview`, `extraction`, `route`, `answer`, `proposed_refund`, and `error` once available. `status` is one of `queued`, `running`, `awaiting_approval`, `completed`, or `failed`.

`GET /runs` accepts optional `status`, `limit`, and `offset` query parameters. It returns `{ "runs": [Run], "total": number, "limit": number, "offset": number }`, sorted newest first. The employee run monitor uses pagination. The approval inbox does not paginate and requests up to 100 runs with `status=awaiting_approval`. The demo store will not have 100 simultaneous paused runs.

`POST /runs/{run_id}/decision` accepts `{ "decision": "approve" }` or `{ "decision": "reject" }`, enqueues a resume job, and returns the current run object with `202`. Poll `GET /runs/{run_id}` until it is completed to read its `answer`.

`GET /settings/daily-run-limit` and `PUT /settings/daily-run-limit` return `{ "daily_run_limit": number }`. The employee console uses these endpoints to set the global UTC-day cap, with `0` disabling the cap.

## Customer portal

Customer identification is optional for general support messages. It is required to list orders, read their refund status, or attach a selected order to a message. `POST /customers/identify` accepts a name and email and returns the matching demo customer or `null`. This lookup is not authentication. `GET /customers/{customer_id}/orders` requires the same name and email as query parameters and returns that customer's orders.

`GET /customers/{customer_id}/runs/{run_id}` requires the same query parameters. It returns the run only when it was created for that customer.

Passing a `thread_id` to `POST /runs` creates a follow-up. The API accepts it only when the stored thread owner matches the supplied customer. A thread without a stored owner returns `403` and must be replaced with a new conversation. These checks only separate callers who provide different customer records. A caller who knows another customer's name and email can identify as that customer. Authentication remains future work.

## Employee business data

The employee console uses `GET` and `POST` on `/customers`, `/products`, and `/orders`, plus `PUT` and `DELETE` on each resource's `/{id}` path. Customer input is `{ "email", "name" }`. Product input is `{ "title", "format", "sku", "price_cents" }`, where format is `Blu-ray`, `DVD`, `4K UHD`, or `box set`. Order input is `{ "order_number", "customer_id", "product_id", "quantity", "ordered_at", "status", "refund_status" }`; `refund_status` defaults to `none`. A duplicate unique value or an invalid reference returns `409`. Deleting a customer or product with orders returns `409` with a dependency message.

Each collection endpoint returns a named array, such as `{ "customers": [Customer] }`. The API validates every create and update with Pydantic. It does not implement optimistic locking or another concurrent-edit transaction policy yet.

The shared field inventory is in [`api-contract.json`](api-contract.json). Backend tests compare it to the Pydantic response models, and console types derive their field names and statuses from it.
