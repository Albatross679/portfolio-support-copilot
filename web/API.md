# API contract

The console calls the FastAPI service at `VITE_API_BASE`. A blank base URL means same-origin requests.

## Create a run

`POST /runs` accepts `{ "message": "customer support text" }` and returns `{ "run_id": "string" }` immediately. Work continues asynchronously.

## Read a run

`GET /runs/{run_id}` returns a run object with `run_id`, `status`, and, once available, `extraction`, `route`, `final_answer`, and `proposed_refund`. `status` is one of `queued`, `processing`, `awaiting_approval`, `completed`, or `failed`. `extraction` contains `order_number`, `product_title`, `format`, `issue_type`, and `sentiment`, each as a string or null. `route` is `billing`, `shipping`, `returns`, `general`, or `refund`. An `awaiting_approval` run includes `proposed_refund` with numeric `amount`, ISO `currency`, and `reason`.

## List paused runs

`GET /runs?status=awaiting_approval` returns `{ "runs": [Run] }`, where every item uses the run object above. This listing endpoint is the small addition needed for the approval inbox and follows the run-status contract in `SCOPE.md`.

## Decide a refund

`POST /runs/{run_id}/decision` accepts `{ "decision": "approve" }` or `{ "decision": "reject" }` and returns `{ "run_id": "string", "status": "completed" }`. The backend resumes the paused graph and the run's final answer is then available through `GET /runs/{run_id}`.
