import json
from typing import TypeVar

import httpx
from pydantic import BaseModel

from support_copilot.config import Settings

SchemaT = TypeVar("SchemaT", bound=BaseModel)


class OpenRouterClient:
    """Small async OpenAI-compatible client used by every graph node."""

    def __init__(self, settings: Settings, http_client: httpx.AsyncClient | None = None) -> None:
        self.settings = settings
        self._client = http_client or httpx.AsyncClient(timeout=60.0)
        self._owns_client = http_client is None

    async def close(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    @property
    def _headers(self) -> dict[str, str]:
        if not self.settings.openrouter_api_key:
            raise RuntimeError("OPENROUTER_API_KEY is required for model calls")
        return {
            "Authorization": f"Bearer {self.settings.openrouter_api_key}",
            "Content-Type": "application/json",
        }

    async def structured(self, schema: type[SchemaT], system: str, user: str) -> SchemaT:
        payload = {
            "model": self.settings.openrouter_model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "temperature": 0,
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": schema.__name__.lower(), "strict": True, "schema": schema.model_json_schema()},
            },
        }
        response = await self._client.post(
            f"{self.settings.openrouter_base_url.rstrip('/')}/chat/completions",
            headers=self._headers,
            json=payload,
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        return schema.model_validate(content if isinstance(content, dict) else json.loads(content))

    async def generate(self, system: str, user: str) -> str:
        payload = {
            "model": self.settings.openrouter_model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "temperature": 0,
        }
        response = await self._client.post(
            f"{self.settings.openrouter_base_url.rstrip('/')}/chat/completions",
            headers=self._headers,
            json=payload,
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        return content if isinstance(content, str) else json.dumps(content)

    async def embed(self, texts: list[str]) -> list[list[float]]:
        response = await self._client.post(
            f"{self.settings.openrouter_base_url.rstrip('/')}/embeddings",
            headers=self._headers,
            json={"model": self.settings.openrouter_embedding_model, "input": texts},
        )
        response.raise_for_status()
        return [item["embedding"] for item in response.json()["data"]]
