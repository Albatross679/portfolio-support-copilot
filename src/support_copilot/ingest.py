import asyncio
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


async def ingest_help_documents(
    pool: AsyncConnectionPool, model: OpenRouterClient, embedding_dim: int
) -> int:
    rows = [
        (path.name, index, chunk)
        for path in sorted(find_help_directory().glob("*.md"))
        for index, chunk in enumerate(chunk_text(path.read_text()))
    ]
    embeddings = await model.embed([row[2] for row in rows])
    if len(embeddings) != len(rows):
        raise ValueError("Embedding provider returned an unexpected number of vectors")
    if any(len(embedding) != embedding_dim for embedding in embeddings):
        raise ValueError(f"Embedding provider did not return {embedding_dim}-value vectors")
    async with pool.connection() as conn:
        await conn.execute("TRUNCATE help_document_embeddings RESTART IDENTITY")
        for (name, index, content), embedding in zip(rows, embeddings, strict=True):
            await conn.execute(
                """
                INSERT INTO help_document_embeddings (document_name, chunk_index, content, metadata, embedding)
                VALUES (%s, %s, %s, %s::jsonb, %s::vector)
                """,
                (name, index, content, json.dumps({"source": name}), vector_literal(embedding)),
            )
        await conn.commit()
    return len(rows)


async def main() -> None:
    from support_copilot.config import get_settings

    settings = get_settings()
    pool = AsyncConnectionPool(settings.database_url, open=False, kwargs={"autocommit": True})
    await pool.open()
    model = OpenRouterClient(settings)
    try:
        count = await ingest_help_documents(pool, model, settings.embedding_dim)
        print(f"Ingested {count} help-document chunks")
    finally:
        await model.close()
        await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
