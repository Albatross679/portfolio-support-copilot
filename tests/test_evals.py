import os

import pytest


@pytest.mark.eval
@pytest.mark.asyncio
async def test_labeled_extract_and_route_evaluation() -> None:
    if not os.getenv("OPENROUTER_API_KEY"):
        pytest.skip("OPENROUTER_API_KEY is not available")
    from scripts.evaluate import evaluate

    scores = await evaluate()
    assert scores["extract_accuracy"] >= 0.75
    assert scores["route_accuracy"] >= 0.75
