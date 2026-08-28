import asyncio
import logging

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg_pool import AsyncConnectionPool

from support_copilot.config import get_settings
from support_copilot.db import apply_schema
from support_copilot.ingest import ingest_help_documents
from support_copilot.model import OpenRouterClient
from support_copilot.seed import seed_business_data

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def bootstrap() -> None:
    settings = get_settings()
    pool = AsyncConnectionPool(settings.database_url, min_size=1, max_size=4, open=False, kwargs={"autocommit": True})
    await pool.open()
    try:
        async with pool.connection() as conn:
            await apply_schema(conn)
            await seed_business_data(conn)
        saver = AsyncPostgresSaver(pool)
        await saver.setup()
        if settings.openrouter_api_key:
            model = OpenRouterClient(settings)
            try:
                await ingest_help_documents(pool, model)
            finally:
                await model.close()
        else:
            logger.warning("Skipping help-document embeddings: OPENROUTER_API_KEY is unset")
    finally:
        await pool.close()


if __name__ == "__main__":
    asyncio.run(bootstrap())
