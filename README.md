# Portfolio Support Copilot

Portfolio Support Copilot is an async customer-support copilot for a physical-media store selling Blu-ray, DVD, 4K UHD, box sets, and collector editions. It turns a customer message into structured data, routes the request, retrieves store policy or queries fake business data, and pauses a simulated refund until a human approves it.

## Architecture

```text
React console
          |
          v
POST /runs -> FastAPI -> Redis/arq queue -> worker -> LangGraph
GET /runs <----------------------------------|       extract -> route -> [rag | sql | refund] -> respond
POST /runs/{id}/decision -> Redis/arq queue -> worker -> Command(resume=approve|reject)
                                                       |
                                                       v
                              Postgres + pgvector <- checkpointer, business tables, help-doc embeddings
```

FastAPI serves the built console and accepts and reports runs. The arq worker owns graph execution, while Redis holds the queue, run status, and cached SQL tool results. A shared async OpenRouter client supplies structured JSON output and embeddings. Postgres stores fake customers, products, orders, pgvector help-document chunks, and LangGraph's durable checkpoint state keyed by `thread_id`.

## API contract

- `POST /runs` accepts `{ "message": "...", "thread_id": "optional", "customer": "optional identity", "order_number": "optional" }` and returns `202` with `{ "run_id", "thread_id" }`.
- `GET /runs/{run_id}` returns queued, running, awaiting_approval, completed, or failed state. Runs use `answer`, `extraction.media_format`, a `{ lane, handler, rationale }` route object, and integer refund `amount_cents`. Paused runs include `proposed_refund`.
- `GET /runs?status=awaiting_approval` lists paused runs for the approval inbox. `GET /runs?limit=25&offset=0` lists runs newest first for employee monitoring.
- `POST /runs/{run_id}/decision` accepts `{ "decision": "approve" | "reject" }`, enqueues a resume job, and returns `202` with the current run state.
- Customer endpoints identify a demo customer by name and email, list that customer's orders, and limit customer run detail to runs created for that customer. This lookup is not authentication.
- Employee data endpoints provide create, read, update, and delete operations for `/customers`, `/products`, and `/orders`. See [`web/API.md`](web/API.md) for payloads and conflict responses.

## Run locally

1. Copy `.env.example` to `.env` and set `OPENROUTER_API_KEY`. The key is required for model calls and help-document ingestion.
2. Run `docker compose up --build`. If port 8000 is already in use, run `API_PORT=8001 docker compose up --build` and use port 8001 in the URLs below.
3. Open `http://localhost:8000` for the built React console. The customer portal identifies a demo customer, lists their orders, and submits support messages. The employee console at `/employees` monitors runs, handles approvals, and edits demo business data. The API documentation remains at `http://localhost:8000/docs`; direct API submissions also work with `curl -X POST http://localhost:8000/runs -H 'content-type: application/json' -d '{"message":"My damaged 4K order ORD-1001 needs a refund."}'`.
4. Poll `GET /runs/<run_id>`. When it is `awaiting_approval`, approve or reject it from the employee Approval inbox, or post `{"decision":"approve"}` to `/runs/<run_id>/decision`.

For console development, run `cd web && npm install && npm run dev`. Leave `VITE_API_BASE` blank to send `/api` requests through the Vite proxy to `http://localhost:8000`, or set `VITE_API_BASE=http://localhost:8000 npm run dev`; the API permits local Vite origins. Use `VITE_API_BASE=http://localhost:8001` when the Compose fallback port is in use.

The `init` Compose service applies the schema, seeds fake business data only when the business tables are empty, creates LangGraph checkpoint tables, and embeds documents in `docs/help/`. It exits successfully without a key so the API and worker can still boot, but RAG runs require embeddings and therefore an OpenRouter key. On later starts, unchanged documents are skipped; changed, added, or removed documents are synchronized automatically. Re-ingest documents manually with `docker compose run --rm init python scripts/ingest_help.py`.

`EMBEDDING_DIM` defaults to 1536, which matches `openai/text-embedding-3-small`. When changing the embedding model or its output size, set both `OPENROUTER_EMBEDDING_MODEL` and `EMBEDDING_DIM`; the changed fingerprint automatically re-ingests every help document. Every init run with `RESET_DEMO_DATA=1` truncates and reseeds the business tables. This does not reset help-document embeddings.

## Development and tests

Install with `pip install . --group dev`, then run `ruff check .` and `pytest -m "not integration and not eval"`. Unit tests fake the model through dependency injection and cover extraction, routing, retrieval, SQL caching and safety, and the LangGraph pause/resume behavior.

The end-to-end test deliberately uses the Compose stack rather than testcontainers because it exercises the same pgvector image, Postgres checkpointer, Redis queue, and separate API and worker processes that the local demo uses. Run `OPENROUTER_API_KEY=... RUN_INTEGRATION=1 pytest -m integration` after `docker compose up --build`. The 20-example labeled evaluation checks extraction issue type plus route lane and handler. Run `OPENROUTER_API_KEY=... pytest -m eval` or `OPENROUTER_API_KEY=... python scripts/evaluate.py`. CI runs lint, secret-free unit tests, and a Docker image build on every push.

## Repository layout

- `src/support_copilot/graph.py` - the checkpointed `extract -> route -> [rag | sql | refund] -> respond` graph.
- `src/support_copilot/api.py` and `src/support_copilot/worker.py` - asynchronous HTTP and arq process boundaries.
- `src/support_copilot/schema.sql`, `seed.py`, and `ingest.py` - Postgres, fake data, and pgvector ingestion.
- `docs/help/` - ten store help documents used by RAG.
- `tests/evals/support_cases.jsonl` - labeled extract and route evaluation set.

## Next

- Authentication and authorization for the employee console. The `/employees` route is intentionally unauthenticated in this demo.
- API-key authentication and per-key rate limiting.
- Optimistic locking or another transaction policy for concurrent employee data edits.
- Structured logging with request tracing and a metrics endpoint.
- Live streaming with server-sent events for agent progress.
- Any real payment integration. Refunds remain simulated against fake business data.

## Frontend

The React and TypeScript support console lives in [web/](web/). It can run against the API or its canned mock mode and is documented in [web/README.md](web/README.md).
