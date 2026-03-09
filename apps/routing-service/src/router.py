from fastapi import FastAPI
import asyncpg
import redis.asyncio as aioredis
import asyncio
import json
import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "../../../.env"), override=True)

app = FastAPI()
redis_client = None
db_pool = None

@app.on_event("startup")
async def startup():
    global redis_client, db_pool
    redis_client = aioredis.from_url(os.environ.get("REDIS_URL", "redis://localhost:6379").strip())
    db_pool = await asyncpg.create_pool("postgresql://ccmp_user:ccmp_password123@127.0.0.1:5433/ccmp?sslmode=disable")
    asyncio.create_task(listen_for_new_cases())

async def listen_for_new_cases():
    pubsub = redis_client.pubsub()
    await pubsub.subscribe("case:new")
    async for message in pubsub.listen():
        if message["type"] == "message":
            data = json.loads(message["data"])
            await route_case(data)

async def evaluate_rules(case_data: dict) -> dict | None:
    async with db_pool.acquire() as conn:
        rules = await conn.fetch(
            "SELECT * FROM routing_rules WHERE is_active=true ORDER BY priority_order ASC"
        )
        for rule in rules:
            conditions = json.loads(rule["conditions"]) if isinstance(rule["conditions"], str) else rule["conditions"]
            if matches_conditions(case_data, conditions):
                return dict(rule)
    return None

def matches_conditions(case_data: dict, conditions: dict) -> bool:
    if not conditions:
        return True  # catch-all
    for key, value in conditions.items():
        if case_data.get(key) != value:
            return False
    return True

async def find_available_agent(queue_id: str) -> str | None:
    # Agents sorted by workload (lowest score = most available)
    # The queue maps to a specific SortedSet ZSET in Redis where score is agent workload/capacity maps.
    if queue_id:
        agents = await redis_client.zrangebyscore(f"ccmp:queue:{queue_id}:agents", 0, "+inf", start=0, num=1)
    else:
        # Fallback broad mapping
        agents = await redis_client.zrangebyscore("ccmp:queue::agents", 0, "+inf", start=0, num=1)

    if not agents:
        return None
        
    agent_id = agents[0].decode()
    # Check presence is still active
    presence = await redis_client.get(f"ccmp:presence:{agent_id}")
    return agent_id if presence == b"ONLINE" else None

async def route_case(data: dict):
    rule = await evaluate_rules(data)
    if not rule:
        await redis_client.publish("queue:backlog", json.dumps(data))
        return
    agent_id = await find_available_agent(data.get("queueId", ""))
    if agent_id:
        await redis_client.publish("case:assigned", json.dumps({
            "caseId": data["caseId"], "agentId": agent_id, "ruleId": rule["id"]
        }))
    else:
        await redis_client.publish("queue:backlog", json.dumps(data))

@app.get("/health")
async def health():
    return {"status": "ok"}
