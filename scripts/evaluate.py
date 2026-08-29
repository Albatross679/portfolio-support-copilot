import asyncio
import json
from pathlib import Path

from support_copilot.config import get_settings
from support_copilot.model import OpenRouterClient
from support_copilot.schemas import Extraction, RouteDecision

CASES = Path(__file__).resolve().parents[1] / "tests" / "evals" / "support_cases.jsonl"


async def evaluate() -> dict[str, float]:
    settings = get_settings()
    if not settings.openrouter_api_key:
        raise RuntimeError("OPENROUTER_API_KEY is required to run model evaluations")
    model = OpenRouterClient(settings)
    rows = [json.loads(line) for line in CASES.read_text().splitlines()]
    extract_correct = 0
    route_correct = 0
    try:
        for row in rows:
            extraction = await model.structured(
                Extraction,
                "Extract physical-media store support fields. Do not invent order numbers.",
                row["message"],
            )
            route = await model.structured(
                RouteDecision,
                "Classify the message. Refund is only for explicit refund requests. SQL is only for aggregate sales questions. Otherwise RAG. Assign the appropriate billing, shipping, returns, or general lane.",
                f"Message: {row['message']}\nExtraction: {extraction.model_dump_json()}",
            )
            extract_correct += extraction.issue_type == row["issue_type"]
            route_correct += route.lane == row["lane"] and route.handler == row["handler"]
    finally:
        await model.close()
    result = {
        "extract_accuracy": extract_correct / len(rows),
        "route_accuracy": route_correct / len(rows),
    }
    print(json.dumps(result, indent=2))
    return result


if __name__ == "__main__":
    asyncio.run(evaluate())
