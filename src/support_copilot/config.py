from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://postgres:postgres@localhost:5432/support_copilot"
    redis_url: str = "redis://localhost:6379/0"
    openrouter_api_key: str = ""
    openrouter_model: str = "openai/gpt-4.1-mini"
    openrouter_embedding_model: str = "openai/text-embedding-3-small"
    embedding_dim: int = Field(default=1536, ge=1, le=16000)
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    reset_demo_data: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
