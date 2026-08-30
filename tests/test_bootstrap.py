from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import pytest

from support_copilot import bootstrap
from support_copilot.config import Settings


class Result:
    def __init__(self, rows: list[Any]) -> None:
        self.rows = rows

    async def fetchone(self) -> Any:
        return self.rows[0]

    async def fetchall(self) -> list[Any]:
        return self.rows


class DemoDatabase:
    def __init__(self) -> None:
        self.business = {"customers": [], "products": [], "orders": []}
        self.embeddings: list[dict[str, Any]] = []


class Connection:
    def __init__(self, database: DemoDatabase) -> None:
        self.database = database

    async def execute(self, query: str, params: tuple[Any, ...] | None = None) -> Result:
        if "SELECT EXISTS" in query:
            return Result([(any(self.database.business[table] for table in self.database.business),)])
        if query.startswith("TRUNCATE orders"):
            for table in self.database.business.values():
                table.clear()
        elif query.startswith("SELECT document_name"):
            fingerprints: dict[str, set[str | None]] = {}
            for row in self.database.embeddings:
                fingerprints.setdefault(row["document_name"], set()).add(row["fingerprint"])
            return Result([(name, list(values)) for name, values in fingerprints.items()])
        elif query.startswith("DELETE FROM help_document_embeddings WHERE NOT"):
            names = set(params[0])
            self.database.embeddings = [
                row for row in self.database.embeddings if row["document_name"] in names
            ]
        elif query.startswith("DELETE FROM help_document_embeddings WHERE document_name"):
            self.database.embeddings = [
                row for row in self.database.embeddings if row["document_name"] != params[0]
            ]
        elif "INSERT INTO help_document_embeddings" in query:
            self.database.embeddings.append(
                {"document_name": params[0], "content": params[2], "fingerprint": params[5]}
            )
        return Result([])

    @asynccontextmanager
    async def cursor(self):
        yield Cursor(self.database)

    async def commit(self) -> None:
        pass


class Cursor:
    def __init__(self, database: DemoDatabase) -> None:
        self.database = database

    async def executemany(self, query: str, values: list[tuple[Any, ...]]) -> None:
        if "INSERT INTO customers" in query:
            self.database.business["customers"].extend(values)
        elif "INSERT INTO products" in query:
            self.database.business["products"].extend(values)
        elif "INSERT INTO orders" in query:
            self.database.business["orders"].extend(values)


class Pool:
    def __init__(self, database: DemoDatabase) -> None:
        self.database = database

    async def open(self) -> None:
        pass

    async def close(self) -> None:
        pass

    @asynccontextmanager
    async def connection(self):
        yield Connection(self.database)


class FakeModel:
    def __init__(self) -> None:
        self.embed_calls: list[list[str]] = []

    async def embed(self, texts: list[str]) -> list[list[float]]:
        self.embed_calls.append(texts)
        return [[0.1, 0.2, 0.3] for _ in texts]

    async def close(self) -> None:
        pass


class Saver:
    def __init__(self, pool: Pool) -> None:
        pass

    async def setup(self) -> None:
        pass


@pytest.fixture
def bootstrap_environment(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> tuple[DemoDatabase, FakeModel]:
    help_directory = tmp_path / "docs" / "help"
    help_directory.mkdir(parents=True)
    (help_directory / "one.md").write_text("First document")
    (help_directory / "two.md").write_text("Second document")
    database = DemoDatabase()
    model = FakeModel()
    settings = Settings(database_url="postgresql://test", openrouter_api_key="test", embedding_dim=3)

    async def apply_schema(_: Connection, __: int) -> None:
        pass

    monkeypatch.setattr(bootstrap, "get_settings", lambda: settings)
    monkeypatch.setattr(bootstrap, "AsyncConnectionPool", lambda *_args, **_kwargs: Pool(database))
    monkeypatch.setattr(bootstrap, "AsyncPostgresSaver", Saver)
    monkeypatch.setattr(bootstrap, "OpenRouterClient", lambda _: model)
    monkeypatch.setattr(bootstrap, "apply_schema", apply_schema)
    monkeypatch.setattr("support_copilot.ingest.find_help_directory", lambda: help_directory)
    return database, model


async def test_second_bootstrap_skips_embeddings_and_preserves_business_data(
    bootstrap_environment: tuple[DemoDatabase, FakeModel],
) -> None:
    database, model = bootstrap_environment

    await bootstrap.bootstrap()
    database.business["orders"][0] = (*database.business["orders"][0][:-1], "approved")
    expected_business = {table: rows.copy() for table, rows in database.business.items()}
    first_call_count = len(model.embed_calls)

    await bootstrap.bootstrap()

    assert len(model.embed_calls) == first_call_count
    assert database.business == expected_business


async def test_changed_document_reembeds_only_that_document(
    bootstrap_environment: tuple[DemoDatabase, FakeModel], tmp_path: Path
) -> None:
    _, model = bootstrap_environment
    await bootstrap.bootstrap()

    (tmp_path / "docs" / "help" / "one.md").write_text("Changed document")
    await bootstrap.bootstrap()

    assert model.embed_calls[-1] == ["Changed document"]
    assert len(model.embed_calls) == 2


async def test_reset_demo_data_wipes_and_reseeds(
    bootstrap_environment: tuple[DemoDatabase, FakeModel], monkeypatch: pytest.MonkeyPatch
) -> None:
    database, _ = bootstrap_environment
    await bootstrap.bootstrap()
    database.business["orders"][0] = (*database.business["orders"][0][:-1], "approved")
    settings = Settings(
        database_url="postgresql://test", openrouter_api_key="test", embedding_dim=3, reset_demo_data=True
    )
    monkeypatch.setattr(bootstrap, "get_settings", lambda: settings)

    await bootstrap.bootstrap()

    assert len(database.business["customers"]) == 3
    assert len(database.business["products"]) == 5
    assert len(database.business["orders"]) == 6
    assert database.business["orders"][0][-1] == "delivered"
