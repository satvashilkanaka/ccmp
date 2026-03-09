# WEEK 19 — Redis & BullMQ Scaling
## Key Namespaces + Burst Handling + Socket.IO Horizontal · Phase 4 · CCMP

> **Prerequisite:** Week 18 complete. DB optimization verified.
> **Paste this entire file into your AI IDE.**

---

## 📋 TASK

1. **Redis key namespace strategy** — document and enforce in `packages/shared/src/redis-keys.ts`:
```typescript
export const RedisKeys = {
  presence:       (agentId: string) => `ccmp:presence:${agentId}`,
  presenceTtl:    () => 90, // seconds
  queueAgents:    (queueId: string) => `ccmp:queue:${queueId}:agents`,
  callHash:       (uuid: string) => `ccmp:call:${uuid}`,
  routingRules:   () => `ccmp:routing:rules:active`,
  routingRuleHash:() => `ccmp:routing:rules:hash`,
  bullmqPrefix:   () => `ccmp:bullmq`,
  sessionPrefix:  () => `ccmp:session`,
  cachePrefix:    () => `ccmp:cache`,
  rateLimitPrefix:() => `ccmp:rl`,
};
```

2. **BullMQ burst handling** — in `workers/src/index.ts`: add concurrency auto-scaling based on queue depth. If `sla` queue depth > 1000, increase worker concurrency to 50. Add `QueueEvents` listener to log burst events.

3. **Socket.IO horizontal scaling** — verify `@socket.io/redis-adapter` is correctly configured for multi-node. Add `sticky sessions` Traefik label to the API service in `docker-compose.yml`:
```yaml
- "traefik.http.services.api.loadbalancer.sticky.cookie=true"
- "traefik.http.services.api.loadbalancer.sticky.cookie.name=ccmp-sticky"
```

4. **Redis connection pooling** — ensure BullMQ uses a separate Redis connection from Socket.IO adapter. Document in `apps/api/src/lib/redis.ts` with named clients: `redisCache`, `redisBullMQ`, `redisPubSub`.

---

## ⚙️ CONSTRAINTS

- Never use the same Redis connection for BullMQ and Socket.IO adapter
- Sticky sessions must use cookie-based affinity (not IP-based) for Docker environments
- Key TTLs must be centralized in `RedisKeys` — never hardcoded in individual files

---

## ✅ VERIFICATION STEP

```bash
# Verify key namespaces
docker exec ccmp-redis redis-cli -a $REDIS_PASSWORD KEYS "ccmp:*" | head -20
# EXPECT: All keys follow ccmp: namespace

# Verify Socket.IO works with sticky sessions
# Open two browser tabs — they should both connect successfully

git add . && git commit -m "feat: week-19 redis scaling complete"
```

**Next:** `README-23-W20-Load-Testing.md`
