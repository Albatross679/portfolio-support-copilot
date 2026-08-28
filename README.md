# Portfolio Support Copilot

Portfolio Support Copilot is an async customer-support copilot for a physical-media store selling Blu-ray, DVD, 4K UHD, box sets, and collector editions. It turns a customer message into structured data, routes the request, retrieves store policy or queries fake business data, and pauses a simulated refund until a human approves it.

## Architecture

```text
React console (separate task)
          |
          v
POST /runs -> FastAPI -> Redis/arq queue -> worker -> LangGraph
GET /runs <----------------------------------|       extract -> route -> [rag | sql | refund] -> respond
POST /runs/{id}/decision -> Redis/arq queue -> worker -> Command(resume=approve|reject)
                                                       |
                                                       v
                              Postgres + pgvector <- checkpointer, business tables, help-doc embeddings
```

FastAPI accepts and reports runs only. The arq worker owns graph execution, while Redis holds the queue, run status, and cached SQL tool results. A shared async OpenRouter client supplies structured JSON output and embeddings. Postgres stores fake customers, products, orders, pgvector help-document chunks, and LangGraph's durable checkpoint state keyed by `thread_id`.

## API contract

- `POST /runs` accepts `{ "message": "...", "thread_id": "optional" }` and returns `202` with `{ "run_id", "thread_id" }`.
- `GET /runs/{run_id}` returns queued, running, awaiting_approval, completed, or failed state. Paused runs include `proposed_refund`.
- `POST /runs/{run_id}/decision` accepts `{ "decision": "approve" | "reject" }`, enqueues a resume job, and returns `202`.

## Run locally

1. Copy `.env.example` to `.env` and set `OPENROUTER_API_KEY`. The key is required for model calls and help-document ingestion.
2. Run `docker compose up --build`. Set `API_PORT=8001` first if port 8000 is already in use.
3. Open `http://localhost:8000/docs` or submit a request with `curl -X POST http://localhost:8000/runs -H 'content-type: application/json' -d '{"message":"My damaged 4K order ORD-1001 needs a refund."}'`.
4. Poll `GET /runs/<run_id>`. When it is `awaiting_approval`, post `{"decision":"approve"}` to `/runs/<run_id>/decision`.

The `init` Compose service applies the schema, seeds fake business data, creates LangGraph checkpoint tables, and embeds all documents in `docs/help/`. It exits successfully without a key so the API and worker can still boot, but RAG runs require embeddings and therefore an OpenRouter key. Re-ingest documents after changes with `docker compose run --rm init python scripts/ingest_help.py`.

`EMBEDDING_DIM` defaults to 1536, which matches `openai/text-embedding-3-small`. When changing the embedding model or its output size, set both `OPENROUTER_EMBEDDING_MODEL` and `EMBEDDING_DIM`. Drop and recreate `help_document_embeddings`, then re-ingest the help documents. This project does not migrate stored embeddings between output sizes.

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

- API-key authentication and per-key rate limiting.
- Structured logging with request tracing and a metrics endpoint.
- Live streaming with server-sent events for agent progress.
- Any real payment integration. Refunds remain simulated against fake business data.
