# WEEK 7b — SIP.js Browser Softphone
## Sub-Prompt B of 2 · Phase 2 · CCMP

> **Prerequisite:** Week 7a complete. FreeSWITCH ESL adapter connected. PHONE cases are being created.
> **Paste this entire file into your AI IDE.**

---

## 🎯 CONTEXT

Week 7, Sub-Prompt B. Build the in-browser WebRTC softphone using SIP.js. Agents answer and control calls directly from the browser — no separate phone hardware needed.

---

## 📋 TASK

### 1. Install SIP.js
```bash
pnpm --filter @ccmp/web add sip.js
```

### 2. `apps/web/src/components/telephony/Softphone.tsx`

Client component implementing:
- SIP.js `UserAgent` with WSS transport to FreeSWITCH port 7443
- Audio-only constraints: `{ audio: true, video: false }`
- **State machine**: `idle` → `ringing` → `connecting` → `connected` → `ended`
- Controls: `answer()` calls `invitation.accept()`, `hangup()` calls `session.bye()`
- **Hold**: `session.sessionDescriptionHandler.peerConnection.getSenders()` then `replaceTrack(null)`. Notify server via `POST /api/v1/telephony/hold`
- **Mute**: `sender.track.enabled = false`
- **DTMF pause**: `POST /api/v1/telephony/pause` with `callUuid` from Socket.IO `call:connected` event
- Always unregister `UserAgent` on component unmount

### 3. `GET /api/v1/telephony/credentials` (new route)
Returns SIP credentials for the authenticated agent. Short-lived (15-minute TTL via JWT). Never expose ESL password.
```typescript
// Returns:
{ sipUri: 'sip:agent-{id}@freeswitch-host', wsUri: 'wss://...', password: '<per-agent-sip-password>', expiresIn: 900 }
```

### 4. Wire into agent desktop layout
Add `<Softphone />` to `apps/web/src/app/(agent)/layout.tsx` — always present when agent is logged in.

---

## ⚙️ CONSTRAINTS

- **Never expose ESL credentials to browser** — all FreeSWITCH commands proxied via API
- Always unregister SIP.js `UserAgent` on component unmount (prevents ghost registrations)
- Hold must mute audio track **locally AND** notify server (for audit logging)
- SIP credentials endpoint is authenticated — requires valid JWT
- `callUuid` stored in component state when Socket.IO emits `call:connected`

---

## 📤 OUTPUT

1. `apps/web/src/components/telephony/Softphone.tsx`
2. `apps/web/src/hooks/useSoftphone.ts` (SIP.js logic extracted to hook)
3. `GET /api/v1/telephony/credentials` route
4. Updated agent desktop layout with `<Softphone />`

---

## ✅ VERIFICATION STEP

```bash
# Open agent desktop in browser
# Initiate a test SIP call to the configured DNIS
# EXPECT: Softphone shows "ringing" state
# EXPECT: Click Answer → state "connected" → audio flows
# EXPECT: Click Pause Recording
# EXPECT: docker compose logs freeswitch | grep "Record pause"
# EXPECT: AuditLog row in DB with action: recording_paused

git add . && git commit -m "feat: week-7b sip.js softphone complete"
```

**Next:** `README-11-W8-Recordings.md`
