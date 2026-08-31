#!/usr/bin/env python3
"""Regenerate the self-contained Portfolio Support Copilot project report."""

from __future__ import annotations

import re
import subprocess
import sys
import tempfile
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORT_SKILL = Path("/Users/qifanwen/.claude/skills/html-report/scripts")
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(REPORT_SKILL))

import report as R  # noqa: E402

from support_copilot.graph import GraphDependencies, build_graph  # noqa: E402


class FakeModel:
    """Shape-only dependency: graph rendering never calls model methods."""

    async def structured(self, *args: object, **kwargs: object) -> object:
        raise AssertionError("Rendering must not invoke the model")

    async def generate(self, *args: object, **kwargs: object) -> str:
        raise AssertionError("Rendering must not invoke the model")

    async def embed(self, *args: object, **kwargs: object) -> list[list[float]]:
        raise AssertionError("Rendering must not invoke the model")


class FakeRepository:
    pass


class FakeCache:
    pass


def render_mermaid(source: str, name: str, scale: int = 1) -> bytes:
    """Render Mermaid source locally, leaving no figure sidecar behind."""
    with tempfile.TemporaryDirectory() as directory:
        work = Path(directory)
        source_path = work / f"{name}.mmd"
        output_path = work / f"{name}.png"
        source_path.write_text(source, encoding="utf-8")
        subprocess.run(
            [
                "mmdc", "-i", str(source_path), "-o", str(output_path), "-b", "transparent",
                "-w", "1500", "-s", str(scale),
            ],
            check=True,
            cwd=ROOT,
        )
        return output_path.read_bytes()


def graph_image() -> bytes:
    graph = build_graph(GraphDependencies(FakeModel(), FakeRepository(), FakeCache()))
    # draw_mermaid() is LangGraph's own rendering representation of the compiled graph.
    mermaid = graph.get_graph().draw_mermaid().replace("graph TD;", "graph LR;")
    return render_mermaid(mermaid, "langgraph")


def schema_columns(schema: str, table: str) -> list[tuple[str, str, str]]:
    """Extract displayed columns and key annotations from the real SQL schema."""
    match = re.search(
        rf"CREATE TABLE IF NOT EXISTS {table} \((.*?)\n\);", schema, flags=re.DOTALL
    )
    if match is None:
        raise ValueError(f"Missing {table} in schema.sql")
    body = match.group(1)
    composite_unique = {
        column.strip()
        for group in re.findall(r"UNIQUE \(([^)]+)\)", body)
        for column in group.split(",")
    }
    columns = []
    for raw_line in body.splitlines():
        line = raw_line.strip().rstrip(",")
        if not line or line.startswith(("UNIQUE", "CONSTRAINT", "CHECK")):
            continue
        match = re.match(r"(\w+)\s+([A-Z]+|vector)(?:\([^)]*\))?\s+(.+)", line)
        if match is None:
            continue
        name, data_type, rest = match.groups()
        keys = []
        if "PRIMARY KEY" in rest:
            keys.append("PK")
        if "REFERENCES" in rest:
            keys.append("FK")
        if "UNIQUE" in rest or name in composite_unique:
            keys.append("UK")
        columns.append((data_type, name, ", ".join(keys)))
    return columns


def er_source() -> str:
    schema = (ROOT / "src/support_copilot/schema.sql").read_text(encoding="utf-8")
    tables = ["customers", "products", "orders", "help_document_embeddings"]
    blocks = []
    for table in tables:
        fields = "\n".join(
            f"        {data_type} {name} {keys}".rstrip()
            for data_type, name, keys in schema_columns(schema, table)
        )
        blocks.append(f"    {table.upper()} {{\n{fields}\n    }}")
    blocks.append(
        "    LANGGRAPH_CHECKPOINTS {\n"
        "        TEXT state \"Library-owned checkpoint tables\"\n"
        "    }"
    )
    return "\n".join(
        [
            "erDiagram",
            *blocks,
            "    CUSTOMERS ||--o{ ORDERS : places",
            "    PRODUCTS ||--o{ ORDERS : contains",
        ]
    )


def main() -> None:
    langgraph_png = graph_image()
    er_png = render_mermaid(er_source(), "database-er")

    R.glossary(
        {
            "LangGraph": {
                "category": "workflow library",
                "expansion": "LangGraph",
                "meaning": {"role": "A graph runtime that persists state and can interrupt then resume a workflow."},
                "example": "The compiled graph has 6 named nodes: extract, route, rag, sql, refund, and respond.",
            },
            "RAG": {
                "category": "retrieval pattern",
                "expansion": "Retrieval-augmented generation",
                "meaning": {"role": "Retrieves relevant source text before a model drafts an answer from that evidence."},
                "example": "One of 3 route handlers retrieves chunks from the 10 store help documents.",
            },
            "Postgres": {
                "category": "database",
                "expansion": "PostgreSQL relational database",
                "meaning": {"role": "Stores relational records, vectors, and durable workflow checkpoints in this application."},
                "example": "One Postgres instance holds 3 data groups: business records, help embeddings, and checkpoint state.",
            },
            "pgvector": {
                "category": "vector extension",
                "expansion": "pgvector",
                "meaning": {"role": "A PostgreSQL extension that stores embedding vectors and supports similarity search."},
                "example": "The schema declares one embedding vector column per help-document chunk.",
            },
            "Redis": {
                "category": "in-memory data store",
                "expansion": "Redis",
                "meaning": {"role": "Carries queued jobs, run-status records, locks, and short-lived SQL results."},
                "example": "Generated SQL results are cached for 300 seconds before they are queried again.",
            },
            "arq": {
                "category": "job queue",
                "expansion": "arq",
                "meaning": {"role": "A Python asynchronous job queue backed by Redis."},
                "example": "A submitted run and its later refund decision are separate queued jobs.",
            },
            "Pydantic": {
                "category": "data validation",
                "expansion": "Pydantic",
                "meaning": {"role": "Python models that validate API payloads and define structured model outputs."},
                "example": "The run status contract has 5 allowed states: queued, running, awaiting_approval, completed, and failed.",
            },
        }
    )

    parts = [
        R.para(
            "<span class='tag'>Python</span> <span class='tag'>FastAPI</span> "
            "<span class='tag'>LangGraph</span> <span class='tag'>Postgres</span> "
            "<span class='tag'>React</span>"
        ),
        R.note(
            "Purpose: show how an asynchronous support workflow keeps evidence, routing, and a refund decision inspectable."
        ),
        R.section("Motivation"),
        R.para(
            "A physical-media store receives policy questions, order questions, sales questions, and refund requests in the same inbox. "
            "The product separates those paths while retaining the evidence and the decision boundary needed for a support agent to review the work."
        ),
        R.section("One message path"),
        R.para(
            "A customer message moves through five stages: <b>1. extract</b> structured fields such as issue type and order number; "
            "<b>2. route</b> to a lane and handler; <b>3. gather evidence</b> with RAG, a read-only SQL query, or a refund proposal; "
            "<b>4. pause</b> only when a refund needs approval; and <b>5. respond</b> from the selected evidence and recent thread context."
        ),
        R.figure(langgraph_png, "Figure 1. Compiled LangGraph message workflow."),
        R.section("Architecture"),
        R.para(
            "The React console submits a run to FastAPI, which records a queued state and returns HTTP 202. Redis and arq carry the job to a separate worker, where the LangGraph workflow runs. "
            f"Keeping graph execution off the web request makes the API responsive and allows the worker to own retries, thread locking, and resume work {R.cite(1)} {R.cite(2)}."
        ),
        R.para(
            "A refund proposal calls the graph interrupt rather than issuing a payment. The worker writes <code>awaiting_approval</code>, and a later approve or reject request enqueues a second job that resumes the same thread checkpoint. "
            "This creates a durable human decision point instead of treating a refund as an ordinary generated answer."
        ),
        R.section("Data layer"),
        R.para(
            "One Postgres instance holds three table groups: transactional business records for customers, products, and orders; searchable help-document embeddings through pgvector; and LangGraph checkpoint tables. "
            f"The checkpoint tables are created and owned by the library, not by the application schema {R.cite(1)} {R.cite(3)}."
        ),
        R.figure(er_png, "Figure 2. Postgres entity relationship diagram."),
        R.section("Shared API contract"),
        R.para(
            f"The backend Pydantic response models and the React console meet at <code>web/api-contract.json</code>. A generator emits TypeScript types from that inventory, while a backend test reconstructs the same inventory from the Pydantic models and fails when it drifts {R.cite(1)} {R.cite(4)}."
        ),
        R.table(
            ["Endpoint", "Boundary"],
            [
                ["<code>POST /runs</code>", "Accept a message and return a run and thread identifier with 202."],
                ["<code>GET /runs/{id}</code>", "Poll the typed run state, extraction, route, answer, or refund proposal."],
                ["<code>GET /runs?status=awaiting_approval</code>", "List the approval inbox."],
                ["<code>POST /runs/{id}/decision</code>", "Queue an approve or reject resume job."],
            ],
            caption="Table 1. Run API contract.",
            align="ll",
        ),
        R.section("Evaluation"),
        R.para(
            "The labeled evaluation set contains 20 support messages. It measures exact issue-type extraction and joint route accuracy, where both the support lane and handler must match the label. "
            f"The automated acceptance floor is 75% for each score; the model evaluation runs only when an API key is supplied {R.cite(1)}."
        ),
        R.table(
            ["Check", "What it measures"],
            [
                ["Extraction", "Exact match for the labeled issue type."],
                ["Routing", "Exact match for the labeled lane and handler together."],
                ["Coverage", "Policy, order, refund, and aggregate sales requests across 20 messages."],
            ],
            caption="Table 2. Labeled evaluation coverage.",
            align="ll",
        ),
        R.section("Limitations"),
        R.olist(
            [
                "Refunds are simulated against fake business data and do not integrate with a payment provider.",
                "The demo has no authentication, authorization, tenant isolation, or rate limiting.",
                "The console polls run status rather than streaming progress to the browser.",
                "Thread context is intentionally minimal: the response node reads only the six most recent stored messages.",
                "The evaluation checks extraction and route labels, not answer factuality, retrieval quality, or the quality of a human approval decision.",
            ]
        ),
        R.section("Conclusion"),
        R.para(
            "Portfolio Support Copilot is a compact demonstration of an agent workflow with typed inputs, explicit routing, evidence-specific handlers, and a durable approval gate. "
            "Its boundaries are visible in the API, graph, database, and evaluation rather than hidden behind a single chat response."
        ),
        R.section("References"),
        R.references(
            [
                "Q. Wen, <i>Portfolio Support Copilot source artifacts: graph.py, worker.py, schema.sql, web/api-contract.json, and tests/evals/support_cases.jsonl</i>, private source tree, Aug. 2026.",
                "LangChain, <i>LangGraph Documentation</i>, 2026.",
                "pgvector contributors, <i>pgvector Documentation</i>, 2026.",
                "Pydantic, <i>Pydantic Documentation</i>, 2025.",
            ]
        ),
    ]
    R.build(
        "LangGraph mock online movie-media store customer support agent",
        f"Qifan Wen · qifanwen679@gmail.com · {date.today().isoformat()}",
        parts,
        ROOT / "reports/project-report.html",
    )


if __name__ == "__main__":
    main()
