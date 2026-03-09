# WEEK 5 — Agent Desktop UI, Real-Time Bridge & Routing Engine
## Phase 1 · CCMP

> **Prerequisite:** Week 4b complete. Case CRUD API works end-to-end.
> **Paste this entire file into your AI IDE.**

---

## 🎯 CONTEXT

Week 5. Full case CRUD API is working. This week wires three things: (1) the Redis→Socket.IO real-time bridge that pushes events to agent browsers, (2) the agent desktop case grid UI, and (3) the Python routing engine v1 that assigns cases to available agents.

---

## 📋 TASK

### 1. `apps/api/src/realtime/bridge.ts`

```typescript
import { Server as SocketIOServer } from 'socket.io';
import { createClient } from 'redis';
import { logger } from '../lib/logger';

const CHANNELS = ['case:new','case:assigned','case:status_changed','case:reassigned','sla:warning','sla:breached','queue:backlog'];

export async function startRealtimeBridge(io: SocketIOServer): Promise<void> {
  // Dedicated subscriber client — separate from BullMQ and pub clients
  const subscriber = createClient({ url: process.env.REDIS_URL });
  await subscriber.connect();

  await subscriber.subscribe(CHANNELS, (message, channel) => {
    try {
      const payload = JSON.parse(message);
      switch (channel) {
        case 'case:assigned':
          // Notify specific agent
          io.to(`agent:${payload.agentId}`).emit('case:assigned', payload);
          break;
        case 'case:status_changed':
          // Notify everyone watching this case
          io.to(`case:${payload.caseId}`).emit('case:status_changed', payload);
          break;
        case 'case:reassigned':
          io.to(`agent:${payload.oldAgentId}`).emit('case:removed', payload);
          io.to(`agent:${payload.newAgentId}`).emit('case:assigned', payload);
          break;
        case 'sla:warning':
          io.to(`case:${payload.caseId}`).emit('sla:warning', payload);
          break;
        case 'sla:breached':
          io.to(`case:${payload.caseId}`).emit('sla:breached', payload);
          io.to('supervisors').emit('sla:breached', payload);
          break;
        case 'queue:backlog':
          io.to('supervisors').emit('queue:backlog', payload);
          break;
        default:
          io.emit(channel, payload);
      }
    } catch (err) {
      logger.error({ err, channel, message }, 'Bridge message parse error');
    }
  });

  logger.info('Real-time bridge started');
}
```

Call `startRealtimeBridge(io)` in `apps/api/src/index.ts` after the server starts listening.

Also add Socket.IO join-room handlers in `apps/api/src/index.ts`:
```typescript
io.on('connection', (socket) => {
  // Agent joins their personal room on connect
  socket.on('agent:join', (agentId: string) => {
    socket.join(`agent:${agentId}`);
  });
  socket.on('case:watch', (caseId: string) => {
    socket.join(`case:${caseId}`);
  });
  socket.on('supervisor:join', () => {
    socket.join('supervisors');
  });
});
```

### 2. `apps/web/src/hooks/usePresenceHeartbeat.ts`

```typescript
'use client';
import { useEffect, useRef } from 'react';
import { socket } from '../lib/socket';

export function usePresenceHeartbeat(agentId: string | undefined) {
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (!agentId) return;

    const sendHeartbeat = () => {
      try {
        socket.emit('agent:heartbeat', { agentId, ts: Date.now() });
      } catch (err) {
        console.warn('Heartbeat failed:', err);
      }
    };

    // Join agent room and send initial heartbeat
    socket.emit('agent:join', agentId);
    sendHeartbeat();

    intervalRef.current = setInterval(sendHeartbeat, 30_000);

    return () => {
      clearInterval(intervalRef.current);
      try {
        socket.emit('presence:update', { agentId, status: 'OFFLINE' });
      } catch { /* ignore on cleanup */ }
    };
  }, [agentId]);
}
```

### 3. `apps/web/src/lib/socket.ts`

```typescript
import { io, Socket } from 'socket.io-client';

let socket: Socket;

if (typeof window !== 'undefined') {
  socket = io(process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000', {
    auth: { token: '' }, // populated by session in components
    reconnectionDelayMax: 30_000,
    randomizationFactor: 0.5,
    autoConnect: true,
  });
}

export { socket };
```

### 4. `apps/web/src/components/CaseGrid.tsx`

Client component with:
- `useInfiniteQuery` from `@tanstack/react-query` fetching `/api/v1/cases` with cursor pagination
- "Load more" button that fetches next cursor
- SLA countdown badge: red if `slaDueAt < now`, amber if < 20% time remaining
- Optimistic status update on row click
- Real-time updates via Socket.IO `case:status_changed` event

### 5. `apps/routing-service/src/router.py`

```python
from fastapi import FastAPI
import asyncpg
import redis.asyncio as aioredis
import asyncio
import json
import os

app = FastAPI()
redis_client = None
db_pool = None

@app.on_event("startup")
async def startup():
    global redis_client, db_pool
    redis_client = aioredis.from_url(os.environ["REDIS_URL"])
    db_pool = await asyncpg.create_pool(os.environ["DATABASE_URL"])
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
    agents = await redis_client.zrangebyscore(f"ccmp:queue:{queue_id}:agents", 0, "+inf", start=0, num=1)
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
```

Create `apps/routing-service/requirements.txt`:
```
fastapi==0.111.0
uvicorn==0.30.1
asyncpg==0.29.0
redis==5.0.4
```

---

## ⚙️ CONSTRAINTS

- `bridge.ts` must use a **dedicated** Redis subscriber client — not the BullMQ or pub client
- `usePresenceHeartbeat`: wrap socket emits in try/catch — socket may not be connected
- SLA badge: recalculate every 30s using `useEffect` with interval, not on every render
- CaseGrid: use `useInfiniteQuery` with cursor — never offset pagination
- Routing engine: `find_available_agent` must check Redis TTL/presence — expired = OFFLINE
- Socket.IO rooms must be namespaced: `agent:${id}` not just `agentId`

---

## 📤 OUTPUT

1. `apps/api/src/realtime/bridge.ts`
2. Updated `apps/api/src/index.ts` (bridge started, join-room handlers)
3. `apps/web/src/hooks/usePresenceHeartbeat.ts`
4. `apps/web/src/lib/socket.ts`
5. `apps/web/src/components/CaseGrid.tsx`
6. `apps/routing-service/src/router.py`
7. `apps/routing-service/requirements.txt`
8. `packages/shared/src/events.ts` (Socket.IO event type definitions)

---

## ✅ VERIFICATION STEP

```bash
# 1. Create a case, watch for routing event
TOKEN="<agent-token>"
curl -s -X POST http://localhost:4000/api/v1/cases \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"subject":"Bridge Test","channel":"PHONE","priority":"HIGH"}' | jq .caseId

# 2. In browser console (agent desktop open):
# EXPECT: console logs "case:assigned" event within 2 seconds

# 3. Status change → both windows update
# Open two browser windows as same agent
# Change status in window 1 → window 2 updates without refresh

# 4. Routing service health
curl http://localhost:8001/health
# EXPECT: {"status":"ok"}

git add . && git commit -m "feat: week-5 agent desktop and real-time bridge"
```

**🎉 Phase 1 Complete! Next:** `README-08-W6-SLA-Engine.md`
