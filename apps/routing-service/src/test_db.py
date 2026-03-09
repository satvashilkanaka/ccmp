import os
import asyncio
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "../../../.env"), override=True)

async def test_all():
    redis_url = os.environ.get("REDIS_URL", "default")
    db_url = os.environ.get("DATABASE_URL", "default")
    print("USING REDIS_URL:", redis_url)
    print("USING DATABASE_URL:", db_url)
    
    print("Connecting Redis...")
    import redis.asyncio as aioredis
    rc = aioredis.from_url(redis_url)
    await rc.ping()
    print("Redis OK")
    
    print("Connecting Postgres...")
    import asyncpg
    pool = await asyncpg.create_pool(db_url)
    print("Postgres OK")
    await pool.close()

if __name__ == '__main__':
    asyncio.run(test_all())
