# WEEK 7a — FreeSWITCH Config & ESL Adapter
## Sub-Prompt A of 2 · Phase 2 · CCMP

> **Prerequisite:** Week 6 complete. SLA engine scheduling jobs correctly.
> **Complete this before Week 7b.**
> **Paste this entire file into your AI IDE.**

---

## 🎯 CONTEXT

Week 7, Sub-Prompt A. Build the FreeSWITCH telephony integration: Docker service, dialplan configuration, and the ESL event socket adapter that bridges call events into the case system.

---

## 📋 TASK

### 1. Add FreeSWITCH to `docker-compose.yml`
```yaml
freeswitch:
  image: signalwire/freeswitch:v1.10
  network_mode: host   # Required for RTP media
  environment:
    - FREESWITCH_ESL_PASSWORD=${FREESWITCH_ESL_PASSWORD}
  volumes:
    - ./config/freeswitch/conf:/etc/freeswitch
    - freeswitch_recordings:/var/lib/freeswitch/recordings
  restart: unless-stopped
```
Add `freeswitch_recordings` to named volumes.

### 2. `config/freeswitch/conf/dialplan/default.xml`
Inbound route that: sets `RECORD_STEREO=true`, starts recording to `/var/lib/freeswitch/recordings/${uuid}.wav`, connects to the ESL socket at `localhost:8084`.

### 3. `apps/api/src/modules/telephony/esl.adapter.ts`
Implement `EslAdapter` class:
- `connect()` with exponential backoff reconnect: `[1000, 2000, 4000, 8000, 16000, 30000]` ms, then repeat 30s
- `onCallAnswered(event)` — create PHONE case via BullMQ job (not inline), store call hash in Redis: `ccmp:call:${uuid}` with `{ caseId, agentId, status: 'answered', startedAt }`
- `onCallEnded(event)` — fetch CDR, create CaseEvent `telephony.call_ended` with duration, delete Redis call hash
- `pauseRecording(callUuid, actorId)` — `conn.bgapi(\`uuid_record ${callUuid} pause\`)`, create AuditLog `action: 'recording_paused'`
- `resumeRecording(callUuid, actorId)` — same but `resume`, AuditLog `recording_resumed`

### 4. Wire in `apps/api/src/index.ts`
```typescript
const eslAdapter = new EslAdapter();
eslAdapter.connect().catch(err => logger.error({ err }, 'ESL initial connect failed'));
```

### 5. Routes in new `apps/api/src/modules/telephony/telephony.router.ts`
- `POST /api/v1/telephony/pause` — requires auth, calls `eslAdapter.pauseRecording()`
- `POST /api/v1/telephony/resume` — requires auth, calls `eslAdapter.resumeRecording()`

---

## ⚙️ CONSTRAINTS

- FreeSWITCH uses `network_mode: host` — required for RTP, means no port mapping needed
- ESL reconnect must use exponential backoff (not fixed interval)
- `onCallAnswered`: create case via **BullMQ job** (not inline) to prevent blocking ESL event loop
- `pauseRecording` always creates AuditLog — even for AGENT role
- Never expose FreeSWITCH ESL credentials to the browser

---

## 📤 OUTPUT

1. Updated `docker-compose.yml` (freeswitch service + volume)
2. `config/freeswitch/conf/dialplan/default.xml`
3. `apps/api/src/modules/telephony/esl.adapter.ts`
4. `apps/api/src/modules/telephony/telephony.router.ts`
5. Updated `apps/api/src/index.ts` (eslAdapter.connect())

---

## ✅ VERIFICATION STEP

```bash
# Start FreeSWITCH
docker compose up -d freeswitch
sleep 10

# Check ESL connected
docker compose logs api | grep "ESL connected"

# Make a test SIP call to configured DNIS
# EXPECT: EslAdapter logs CHANNEL_ANSWER
# EXPECT: PHONE case created in DB within 3s
# EXPECT: Redis key ccmp:call:<uuid> exists

docker exec ccmp-redis redis-cli -a $REDIS_PASSWORD KEYS "ccmp:call:*"

git add . && git commit -m "feat: week-7a freeswitch esl adapter complete"
```

**Next:** `README-10-W7b-Softphone.md`
