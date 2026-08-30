import asyncio
import hashlib
import json
from pathlib import Path

from psycopg_pool import AsyncConnectionPool

from support_copilot.db import vector_literal
from support_copilot.model import OpenRouterClient


def find_help_directory() -> Path:
    candidates = [
        Path.cwd() / "docs" / "help",
        Path(__file__).resolve().parents[2] / "docs" / "help",
    ]
    for candidate in candidates:
        if any(candidate.glob("*.md")):
            return candidate
    raise FileNotFoundError("No help documents were found in docs/help")


def chunk_text(text: str, chunk_size: int = 700, overlap: int = 100) -> list[str]:
    normalized = " ".join(text.split())
    if len(normalized) <= chunk_size:
        return [normalized]
    chunks: list[str] = []
    start = 0
    while start < len(normalized):
        end = min(len(normalized), start + chunk_size)
        if end < len(normalized):
            end = normalized.rfind(" ", start, end) or end
        chunks.append(normalized[start:end])
        start = max(end - overlap, start + 1)
    return chunks


def document_fingerprint(text: str, embedding_model: str, embedding_dim: int) -> str:
    value = f"{text}\0{embedding_model}\0{embedding_dim}".encode()
    return hashlib.sha256(value).hexdigest()


async def ingest_help_documents(
    pool: AsyncConnectionPool,
    model: OpenRouterClient,
    embedding_dim: int,
    embedding_model: str,
) -> int:
    documents = []
    for path in sorted(find_help_directory().glob("*.md")):
        text = path.read_text()
        documents.append((path.name, text, chunk_text(text)))
    fingerprints = {
        name: document_fingerprint(text, embedding_model, embedding_dim)
        for name, text, _ in documents
    }
    async with pool.connection() as conn:
        result = await conn.execute(
            "SELECT document_name, array_agg(DISTINCT document_fingerprint) "
            "FROM help_document_embeddings GROUP BY document_name"
        )
        stored_fingerprints = {name: set(values) for name, values in await result.fetchall()}
    changed = [
        document
        for document in documents
        if stored_fingerprints.get(document[0]) != {fingerprints[document[0]]}
    ]
    rows = [
        (name, index, chunk) for name, _, chunks in changed for index, chunk in enumerate(chunks)
    ]
    embeddings = await model.embed([row[2] for row in rows]) if rows else []
    if len(embeddings) != len(rows):
        raise ValueError("Embedding provider returned an unexpected number of vectors")
    if any(len(embedding) != embedding_dim for embedding in embeddings):
        raise ValueError(f"Embedding provider did not return {embedding_dim}-value vectors")
    async with pool.connection() as conn:
        async with conn.transaction():
            await conn.execute(
                "DELETE FROM help_document_embeddings WHERE NOT (document_name = ANY(%s))",
                (list(fingerprints),),
            )
            for name, _, _ in changed:
                await conn.execute(
                    "DELETE FROM help_document_embeddings WHERE document_name = %s", (name,)
                )
            for (name, index, content), embedding in zip(rows, embeddings, strict=True):
                await conn.execute(
                    """
                    INSERT INTO help_document_embeddings
                        (document_name, chunk_index, content, metadata, embedding, document_fingerprint)
                    VALUES (%s, %s, %s, %s::jsonb, %s::vector, %s)
                    """,
                    (
                        name,
                        index,
                        content,
                        json.dumps({"source": name}),
                        vector_literal(embedding),
                        fingerprints[name],
                    ),
                )
    return len(rows)


async def main() -> None:
    from support_copilot.config import get_settings

    settings = get_settings()
    pool = AsyncConnectionPool(settings.database_url, open=False, kwargs={"autocommit": True})
    await pool.open()
    model = OpenRouterClient(settings)
    try:
        count = await ingest_help_documents(
            pool, model, settings.embedding_dim, settings.openrouter_embedding_model
        )
        print(f"Ingested {count} help-document chunks")
    finally:
        await model.close()
        await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
