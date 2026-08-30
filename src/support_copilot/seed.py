from datetime import UTC, datetime, timedelta

from psycopg import AsyncConnection


async def seed_business_data(conn: AsyncConnection, reset: bool = False) -> None:
    if reset:
        await conn.execute("TRUNCATE orders, products, customers RESTART IDENTITY CASCADE")
    else:
        result = await conn.execute(
            """
            SELECT EXISTS (SELECT 1 FROM customers)
                OR EXISTS (SELECT 1 FROM products)
                OR EXISTS (SELECT 1 FROM orders)
            """
        )
        if (await result.fetchone())[0]:
            return
    customers = [
        ("maya@example.test", "Maya Chen"),
        ("sam@example.test", "Sam Rivera"),
        ("lee@example.test", "Lee Patel"),
    ]
    async with conn.cursor() as cur:
        await cur.executemany("INSERT INTO customers (email, name) VALUES (%s, %s)", customers)
    products = [
        ("The Last Horizon", "4K UHD", "TLH-4K", 2999),
        ("The Last Horizon", "Blu-ray", "TLH-BR", 1999),
        ("Midnight Archive", "DVD", "MNA-DVD", 1299),
        ("Cinema Classics Vol. 1", "box set", "CCV1-BOX", 7999),
        ("Solaris Revisited", "4K UHD", "SOL-4K", 2799),
    ]
    async with conn.cursor() as cur:
        await cur.executemany(
            "INSERT INTO products (title, format, sku, price_cents) VALUES (%s, %s, %s, %s)",
            products,
        )
    now = datetime.now(UTC)
    orders = [
        ("ORD-1001", 1, 1, 1, now - timedelta(days=4), "delivered"),
        ("ORD-1002", 2, 2, 1, now - timedelta(days=8), "shipped"),
        ("ORD-1003", 3, 3, 2, now - timedelta(days=36), "delivered"),
        ("ORD-1004", 1, 4, 1, now - timedelta(days=13), "delivered"),
        ("ORD-1005", 2, 1, 3, now - timedelta(days=18), "delivered"),
        ("ORD-1006", 3, 5, 1, now - timedelta(days=2), "preorder"),
    ]
    async with conn.cursor() as cur:
        await cur.executemany(
            """
            INSERT INTO orders (order_number, customer_id, product_id, quantity, ordered_at, status)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            orders,
        )
    await conn.commit()
