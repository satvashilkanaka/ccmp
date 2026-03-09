# WEEK 25 — Email Integration & Notifications
## Nodemailer + React Email Templates + Notification Preferences · Phase 5 · CCMP

> **Prerequisite:** Week 24 complete. Admin module working.
> **Paste this entire file into your AI IDE.**

---

## 📋 TASK

1. **Email transport** — `apps/api/src/lib/email.ts`:
   - Nodemailer SMTP transport using `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` env vars
   - `sendEmail(to, subject, htmlContent)` function wrapped in `emailBreaker.fire()`

2. **7 React Email templates** in `apps/api/src/templates/`:
   - `SlaWarning.tsx` — agent's case approaching SLA breach
   - `SlaBreach.tsx` — SLA breached, includes escalation info
   - `CaseAssigned.tsx` — new case assigned to agent
   - `QaReviewCompleted.tsx` — QA review completed, score, coaching notes
   - `DailySummary.tsx` — supervisor morning briefing
   - `CsatSurvey.tsx` — customer satisfaction survey link
   - `Welcome.tsx` — new user welcome email

3. **Wire SLA emails** (CRITICAL GAP G5-02) — in `workers/src/processors/sla.processor.ts`:
   ```typescript
   // On sla_warning:
   const html = await render(SlaWarning({ caseId, agentName, slaDueAt }));
   await emailBreaker.fire(() => sendEmail(agentEmail, 'SLA Warning', html));
   
   // On sla_breach:
   const html = await render(SlaBreach({ caseId, agentName, supervisorName }));
   await emailBreaker.fire(() => sendEmail(supervisorEmail, 'SLA Breach', html));
   ```

4. **`NotificationPreference` migration** — run: `pnpm prisma migrate dev --name add_notification_prefs`

5. **`GET/PATCH /api/v1/notifications/preferences`** — agent can enable/disable each notification type.

6. **Daily Summary BullMQ cron** — 6am job: aggregate yesterday's metrics, render `DailySummary` template, send to all SUPERVISORs with `emailDailySummary: true`.

7. **`apps/web/src/app/(agent)/settings/notifications/page.tsx`** — notification preferences UI with toggle switches.

---

## ⚙️ CONSTRAINTS

- `sendEmail` always wrapped in `emailBreaker.fire()` — email outage must NOT block SLA escalation
- React Email: use `renderAsync()` server-side — never render in browser
- Check `NotificationPreference` before sending — respect user opt-outs
- Daily summary cron: use `addRepeatableJob` with cron expression `0 6 * * *`

---

## ✅ VERIFICATION STEP

```bash
# Trigger SLA breach
# Set a case with 1-min SLA, wait for breach

# EXPECT: SLA breach email delivered to supervisor inbox within 60s

# Test daily summary manually
curl -s -X POST http://localhost:4000/api/v1/admin/cron/daily-summary \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# EXPECT: Emails sent to all supervisors with emailDailySummary: true

git add . && git commit -m "feat: week-25 notifications complete"
```

**Next:** `README-29-W26-UAT.md`
