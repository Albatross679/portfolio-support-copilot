import asyncio
import os

import httpx
import pytest


@pytest.mark.integration
@pytest.mark.asyncio
async def test_submit_poll_pause_approve_and_finish() -> None:
    """Run with docker compose up --build, OPENROUTER_API_KEY=... RUN_INTEGRATION=1 pytest -m integration."""
    if os.getenv("RUN_INTEGRATION") != "1" or not os.getenv("OPENROUTER_API_KEY"):
        pytest.skip("requires the Compose stack and OPENROUTER_API_KEY")
    base_url = os.getenv("INTEGRATION_BASE_URL", "http://localhost:8000")
    async with httpx.AsyncClient(base_url=base_url, timeout=20) as client:
        created = await client.post(
            "/runs", json={"message": "My damaged 4K UHD order ORD-1001 needs a refund."}
        )
        created.raise_for_status()
        run_id = created.json()["run_id"]
        paused = await poll(client, run_id, {"awaiting_approval", "failed"})
        assert paused["status"] == "awaiting_approval", paused
        assert paused["proposed_refund"]["order_number"] == "ORD-1001"
        decision = await client.post(f"/runs/{run_id}/decision", json={"decision": "approve"})
        decision.raise_for_status()
        completed = await poll(client, run_id, {"completed", "failed"})
        assert completed["status"] == "completed", completed
        assert completed["answer"]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_policy_question_uses_the_seeded_help_documents() -> None:
    if os.getenv("RUN_INTEGRATION") != "1" or not os.getenv("OPENROUTER_API_KEY"):
        pytest.skip("requires the Compose stack and OPENROUTER_API_KEY")
    base_url = os.getenv("INTEGRATION_BASE_URL", "http://localhost:8000")
    async with httpx.AsyncClient(base_url=base_url, timeout=20) as client:
        created = await client.post(
            "/runs", json={"message": "What is the return window for an unopened Blu-ray?"}
        )
        created.raise_for_status()
        completed = await poll(client, created.json()["run_id"], {"completed", "failed"})
        assert completed["status"] == "completed", completed
        assert completed["route"]["handler"] == "rag"
        assert "30" in completed["answer"]


async def poll(client: httpx.AsyncClient, run_id: str, terminal: set[str]) -> dict:
    for _ in range(60):
        response = await client.get(f"/runs/{run_id}")
        response.raise_for_status()
        payload = response.json()
        if payload["status"] in terminal:
            return payload
        await asyncio.sleep(1)
    raise AssertionError("run did not reach a terminal state")
