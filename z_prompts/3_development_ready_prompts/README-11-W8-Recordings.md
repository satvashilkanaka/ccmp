# WEEK 8 — Encrypted Call Recordings
## MinIO + Role-Gated Playback + Retention · Phase 2 · CCMP

> **Prerequisite:** Week 7b complete. Telephony adapter fires correctly.
> **Paste this entire file into your AI IDE.**

---

## 📋 TASK

**Files to create:**
- `scripts/setup-minio.ts` — create `ccmp-recordings` bucket, apply AES-256 SSE, set 90-day expiration lifecycle rule. Idempotent.
- `apps/api/src/modules/recordings/recording.service.ts` — `ingestRecording(callUuid, caseId, localPath)`: upload with `x-amz-server-side-encryption: AES256` header, create Recording row, delete local temp file. Use `minioBreaker` circuit breaker. `generatePlaybackUrl(recordingId, requestorId, requestorRole)`: check `playbackRoles = [QA_ANALYST, SUPERVISOR, ADMIN]`, generate 15-min presigned URL (TTL=900s), **always** create AuditLog `action: "played"`.
- `apps/api/src/modules/recordings/recordings.router.ts` — `GET /:id/playback-url` behind `requireRole([QA_ANALYST, SUPERVISOR, ADMIN])`.
- `workers/src/processors/recording-retention.processor.ts` — find recordings older than `RECORDING_RETENTION_DAYS`, delete from MinIO in batches of 100, delete DB rows. Keep AuditLog rows permanently.
- Wire `EslAdapter.onRecordingStop` → BullMQ job `ingest-recording` (not inline).
**Constraints:**
- Presigned URL TTL: exactly **900 seconds** — no more
- Throw `ForbiddenError` BEFORE generating URL — never log a forbidden access URL
- Retention cleanup: batches of 100 — never process all at once
- Circuit breaker on MinIO: open after 50% errors, `resetTimeout: 30000` → HTTP 503
- AuditLog for playback: wrap in try/catch but re-throw only if DB is completely down

---

## ✅ VERIFICATION STEP

```bash
# Run tests and verify output for this week
pnpm test

# Then commit:
git add . && git commit -m "feat: w8 recordings complete"
```

**Next:** `README-12-W9-Supervisor.md`
