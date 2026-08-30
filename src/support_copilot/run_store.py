import json
from typing import Any


def awaiting_orders_key(customer_id: int) -> str:
    return f"customer:{customer_id}:awaiting-orders"


async def write_run_status(redis: Any, run_id: str, **update: Any) -> None:
    key = f"run:{run_id}"
    existing = await redis.get(key)
    previous = (
        json.loads(existing.decode() if isinstance(existing, bytes) else existing)
        if existing
        else {"run_id": run_id}
    )
    data = {**previous, **update}
    async with redis.pipeline(transaction=True) as transaction:
        transaction.set(key, json.dumps(data, default=str))
        if (
            previous.get("status") == "awaiting_approval"
            and previous.get("customer_id") is not None
            and previous.get("order_number")
        ):
            transaction.hdel(awaiting_orders_key(previous["customer_id"]), run_id)
        if (
            data.get("status") == "awaiting_approval"
            and data.get("customer_id") is not None
            and data.get("order_number")
        ):
            transaction.hset(awaiting_orders_key(data["customer_id"]), run_id, data["order_number"])
        await transaction.execute()
