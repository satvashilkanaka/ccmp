# WEEK 21 — Frontend Performance
## Bundle Optimization + WebSocket Reconnection + Infinite Scroll · Phase 4 · CCMP

> **Prerequisite:** Week 20 complete. k6 tests passing with committed results.
> **Paste this entire file into your AI IDE.**

---

## 📋 TASK

1. **Bundle analysis**: add `@next/bundle-analyzer`. Run `pnpm analyze`. Identify chunks > 50kB.

2. **Dynamic imports** — replace heavy synchronous imports with `next/dynamic`:
   - `RecordingPlayer` → `dynamic(() => import('../components/RecordingPlayer'), { ssr: false, loading: () => <PlayerSkeleton /> })`
   - `RechartsChart` → `dynamic(() => import('../components/RechartsChart'), { ssr: false })`
   - All chart components in reports dashboard

3. **WebSocket reconnection hook**: `apps/web/src/hooks/useRealtimeConnection.ts`
   - Exponential backoff: `reconnectionDelayMax: 30_000`, `randomizationFactor: 0.5`
   - On reconnect: invalidate all React Query caches with `queryClient.invalidateQueries()`
   - Show "Reconnecting..." banner to user during disconnect
   - Prevent thundering herd: randomization factor prevents all clients reconnecting simultaneously

4. **CaseGrid infinite scroll** — replace "Load more" button with Intersection Observer:
   - `useInfiniteQuery` already in place from Week 5
   - Add `ref` to last row, trigger `fetchNextPage` when it enters viewport
   - Show skeleton rows while loading

---

## ⚙️ CONSTRAINTS

- Target: main JS bundle < **200kB gzipped**
- `ssr: false` for client-only components (audio player, charts)
- Always provide `loading` skeleton for dynamically imported components
- Invalidate React Query caches on Socket.IO reconnect — stale data must not persist

---

## ✅ VERIFICATION STEP

```bash
pnpm --filter @ccmp/web build && pnpm --filter @ccmp/web analyze
# EXPECT: First Load JS < 200kB for main route

# Test reconnection:
# 1. Open agent desktop in browser
# 2. docker compose stop api
# 3. EXPECT: "Reconnecting..." banner appears
# 4. docker compose start api
# 5. EXPECT: Banner disappears, case list refreshes automatically

git add . && git commit -m "feat: week-21 frontend performance complete"
```

**Next:** `README-25-W22-Resilience.md`
