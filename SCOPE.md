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

1. `POST /runs` accepts the message, claims one run against the global UTC-day limit,
   puts a job on a Redis queue via arq, and returns a `run_id` immediately. The active
   limit is stored in Postgres and can be changed from the employee console.
2. A separate worker process pulls the job off the queue and runs the graph.
3. `GET /runs/{run_id}` returns the current status. When the graph is paused it returns
   `awaiting_approval` along with the proposed refund.
4. `POST /runs/{run_id}/decision` resumes the graph with the human's approve or reject.

## Data layer

One Postgres instance holds three groups of tables:

- LangGraph checkpoint tables (the saved graph state).
- Application tables: orders, customers, products, runtime settings, and thread owners.
  The fake business records are seeded.
- A pgvector table holding embeddings of the help documents for RAG.

Redis holds the arq job queue, each job's status and result, and a cache of tool
results (for example a repeated SQL lookup). It also holds the global daily run counter,
which expires at the next UTC day.

Two data services total: Postgres and Redis.

## Model layer

- One model client pointed at OpenRouter. The specific model is set by an environment
  variable, so switching models needs no code change.
- Structured output uses the model's structured-output mode against a Pydantic schema.
  The extract node and the standalone text-to-structured feature share this one mechanism.

## Frontend

A React and TypeScript console split into customer and employee areas:

- The customer area identifies a demo customer by name and email, lists their orders,
  submits support messages and follow-ups, and shows the resulting answers. The lookup
  is not authentication.
- The employee area at `/employees` lists recent runs newest first and opens the same
  run detail view.
- The employee approval inbox lists paused runs with approve and reject buttons that
  call the decision endpoint.
- Employee tables create, read, update, and delete demo customers, products, and orders.
- Employee settings read and update the global daily run limit without restarting the app.

It is a thin client over a strong backend, honest about that. No design-system polish.

## In scope (committed)

- The full backend: FastAPI service, arq worker, the LangGraph graph with all five nodes,
  Postgres (checkpointer plus application tables plus pgvector), Redis (queue, run counter,
  and cache).
- A global UTC-day run limit that defaults to 50, can be changed by an employee, and can
  be disabled with a value of zero.
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

- Authentication and authorization for the employee area.
- A concurrent-edit transaction policy for employee business data.
- API-key authentication and per-key rate limiting. The global daily run limit is the
  deliberate exception.
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
