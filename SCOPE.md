# Project Scope: Support Copilot for a Physical-Media Store

Working name only. Rename the folder and product whenever you like.

## What it is

A customer-support copilot for an online store that sells physical movie and film
records: Blu-ray, DVD, 4K UHD, box sets, and collector editions. A support message
comes in, and one system reads it, decides what it is about, answers it from the store's
help docs or its business database, and pauses for a human when it wants to do something
risky like issue a refund.

It is one product with five capabilities, not five separate demos. The five capabilities
are nodes on a single path a message travels.

## Who it is for

This is a portfolio and interview artifact. The audience is a hiring manager or engineer
reviewing the repo and hearing you talk through it. Every choice below is made for
depth and a coherent story over breadth of shallow features.

## The five capabilities

All five are stages of one run, in order:

1. Turn unlabeled text into structured data. A support message becomes fixed fields:
   order number, product title, format, issue type, sentiment. Done with the model's
   structured-output mode against a fixed schema.
2. Customer-support routing. The structured message gets a billing, shipping, returns,
   or general lane. The selected handler is RAG, SQL, or refund.
3. RAG question answering. For policy questions (returns, region codes, damaged discs,
   preorders) the answer is drawn from the store's help documents.
4. SQL question answering. For data questions ("how many 4K copies of this title sold
   last month") the system queries the store's business database.
5. Human approval workflow. When the run wants to issue a refund, it pauses, saves its
   state, and waits for a person to approve or reject before finishing.

## How it runs (architecture)

One stateful LangGraph graph. A message enters and flows through nodes:

    extract  ->  route  ->  [ RAG  |  SQL  |  refund ]  ->  respond

- The route node's decision picks which handler node runs next.
- The refund node calls `interrupt()` to pause. The Postgres checkpointer holds the
  paused state until a human resumes it, so a run can wait minutes or hours without
  holding any process open.
- State is keyed by a `thread_id` so a conversation can span many messages.

The graph does not run inside the web request. The flow is:

1. The customer portal looks up a name and email and reads only that customer's orders.
   This lookup is not authentication.
2. `POST /runs` accepts the message and optional matched customer and selected order. It
   puts a job on a Redis queue via arq and returns a `run_id` immediately.
3. A separate worker process pulls the job off the queue and runs the graph. In customer
   SQL queries, references to customer and order tables are restricted to the matched id.
4. Customer run reads confirm the same customer lookup pair and customer id. Employee
   run reads use `GET /runs/{run_id}`. A paused run returns `awaiting_approval` with the
   proposed refund.
5. `POST /runs/{run_id}/decision` resumes the graph with the human's approve or reject.

## Data layer

One Postgres instance holds three groups of tables:

- LangGraph checkpoint tables (the saved graph state).
- Business tables: orders, customers, products, all seeded with fake data.
- A pgvector table holding embeddings of the help documents for RAG.

Redis holds the arq job queue, each job's status and result, and a cache of tool
results (for example a repeated SQL lookup).

Two data services total: Postgres and Redis.

## Model layer

- One model client pointed at OpenRouter. The specific model is set by an environment
  variable, so switching models needs no code change.
- Structured output uses the model's structured-output mode against a Pydantic schema.
  The extract node and the standalone text-to-structured feature share this one mechanism.

## Frontend

A focused console in React and TypeScript with separate customer and employee entry points:

- Customer portal: matches a name and email, lists that customer's orders, submits a
  support message about one order or a general question, and watches that customer's run.
- Employee console: submits a support message and retains a thread for follow-up messages.
- Run view: polls the customer-specific or employee endpoint and shows the structured
  extraction, the chosen route, and the final answer.
- Approval inbox: lists paused runs waiting on an employee, each with approve and reject
  buttons that call the decision endpoint.

It is a thin client over a strong backend, honest about that. No design-system polish.

## In scope (committed)

- The full backend: FastAPI service, arq worker, the LangGraph graph with all five nodes,
  Postgres (checkpointer plus business tables plus pgvector), Redis (queue plus cache).
- Connection pooling for Postgres, one shared model and Redis client built once at startup.
- Async throughout, with any blocking or CPU-bound work pushed off the event loop.
- The React console described above.
- Automated tests: unit tests for the nodes with the model faked through dependency
  injection, an end-to-end test of the run then poll then approve flow, and a small
  evaluation set checking the extract and route nodes against labeled examples.
- CI on GitHub Actions: lint, run tests, build the Docker image on every push.
- Docker Compose for local run of the whole stack.
- AWS deployment, staged: first the same Docker Compose on one small EC2 box to prove it
  deploys, then the credible version with the API and worker containers on ECS Fargate,
  Postgres on RDS, and Redis on ElastiCache.

## Out of scope (named as "next" in the README)

- Real customer and employee authentication, authorization, and per-key rate limiting.
  The customer name and email lookup is intentionally not authentication.
- Structured logging with request tracing and a metrics endpoint.
- Live streaming (server-sent events) of the agent's progress. Polling covers the demo.
- Any real payment integration. Refunds are simulated against the fake business data.

## Technology, and where each piece is used

- Python backend engineering and asyncio: the whole service is async.
- FastAPI: the web service and its endpoints.
- Pydantic: request and response models, and the structured-output schemas.
- arq and Redis: background job queue, job status and result store, tool-result cache.
- Connection pooling: the Postgres pool, plus the shared model and Redis clients.
- LangGraph: the stateful graph, with the Postgres checkpointer and `interrupt()`.
- SQL and Postgres: the business database behind SQL question answering, and the store
  for checkpoints and vectors.
- RAG with pgvector: help-document retrieval for policy questions.
- LLM structured input and output: the extract and route nodes.
- OpenRouter: the model provider, chosen by config.
- Docker: images for the API and worker, Docker Compose for the local stack.
- AWS: ECS Fargate, RDS, ElastiCache, staged after an EC2 step.
- React and TypeScript: the support console.

## What "done" looks like

- A single `docker compose up` brings the whole stack up locally.
- A message submitted in the console is extracted, routed, answered from RAG or SQL, and
  a refund case pauses in the approval inbox and finishes only after a human decision.
- Tests and CI pass on GitHub.
- The stack runs on AWS at a reachable URL.
- You can talk through any single choice in this document and why it was made.

## Reuse from existing work

- The `LangGraph` learning folder has the tool-calling agent to draw the graph patterns
  from.
