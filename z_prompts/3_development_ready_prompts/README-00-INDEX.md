# CCMP — Atomic Implementation Roadmap
## AI-IDE Prompt Index · 28 Weeks · Express.js + Next.js + PostgreSQL

> **How to use:** Open each README in order. Paste the full contents of each file into your AI IDE chat. Complete the **Verification Step** at the bottom before moving to the next file. Never skip verification.

---

## 📋 Pre-Flight — Run This First

Before any prompt, run:
```bash
# Verify your environment matches exactly
node --version       # must be v22.x
pnpm --version       # must be 9.x
docker --version     # must be 26.x
docker compose version  # must be 2.28.x
```

---

## 📁 File Index

| File | Week | Title | Phase |
|------|------|-------|-------|
| [README-00-INDEX.md](README-00-INDEX.md) | — | This index (start here) | — |
| [README-00-PREFLIGHT.md](README-00-PREFLIGHT.md) | — | Environment setup + setup.sh | Pre-Work |
| [README-01-W1-Infrastructure.md](README-01-W1-Infrastructure.md) | Week 1 | Docker Compose + Traefik | Phase 1 |
| [README-02-W2a-Database-Schema.md](README-02-W2a-Database-Schema.md) | Week 2a | Prisma Schema + Migrations | Phase 1 |
| [README-03-W2b-Express-Bootstrap.md](README-03-W2b-Express-Bootstrap.md) | Week 2b | Express.js Server + Seed | Phase 1 |
| [README-04-W3-Auth-Middleware.md](README-04-W3-Auth-Middleware.md) | Week 3 | Keycloak RBAC + Auth Middleware | Phase 1 |
| [README-05-W4a-Case-Service.md](README-05-W4a-Case-Service.md) | Week 4a | Case Service + State Machine | Phase 1 |
| [README-06-W4b-Cases-Router.md](README-06-W4b-Cases-Router.md) | Week 4b | Cases Router + Zod Validation | Phase 1 |
| [README-07-W5-Agent-Desktop.md](README-07-W5-Agent-Desktop.md) | Week 5 | Agent Desktop UI + Real-Time Bridge | Phase 1 |
| [README-08-W6-SLA-Engine.md](README-08-W6-SLA-Engine.md) | Week 6 | SLA Engine + BullMQ + Escalation | Phase 2 |
| [README-09-W7a-FreeSWITCH-ESL.md](README-09-W7a-FreeSWITCH-ESL.md) | Week 7a | FreeSWITCH Config + ESL Adapter | Phase 2 |
| [README-10-W7b-Softphone.md](README-10-W7b-Softphone.md) | Week 7b | SIP.js Browser Softphone | Phase 2 |
| [README-11-W8-Recordings.md](README-11-W8-Recordings.md) | Week 8 | Encrypted Recordings + MinIO | Phase 2 |
| [README-12-W9-Supervisor.md](README-12-W9-Supervisor.md) | Week 9 | Supervisor Dashboard + Actions | Phase 2 |
| [README-13-W10-Chat-Search.md](README-13-W10-Chat-Search.md) | Week 10 | Chat Intake + Meilisearch | Phase 2 |
| [README-14-W11-Integration-Tests.md](README-14-W11-Integration-Tests.md) | Week 11 | Integration Testing + Hardening | Phase 2 |
| [README-15-W12-QA-Module.md](README-15-W12-QA-Module.md) | Week 12 | QA Review Module | Phase 3 |
| [README-16-W13-Compliance-Audit.md](README-16-W13-Compliance-Audit.md) | Week 13 | Compliance + Audit + PDF Export | Phase 3 |
| [README-17-W14-Reporting.md](README-17-W14-Reporting.md) | Week 14 | Reporting + CSV Streaming | Phase 3 |
| [README-18-W15-CSAT.md](README-18-W15-CSAT.md) | Week 15 | CSAT Survey Pipeline | Phase 3 |
| [README-19-W16-Knowledge-Base.md](README-19-W16-Knowledge-Base.md) | Week 16 | Knowledge Base | Phase 3 |
| [README-20-W17-Observability.md](README-20-W17-Observability.md) | Week 17 | Prometheus + Grafana + Loki | Phase 3 |
| [README-21-W18-DB-Optimization.md](README-21-W18-DB-Optimization.md) | Week 18 | DB Indexes + Partitioning + Replica | Phase 4 |
| [README-22-W19-Redis-Scaling.md](README-22-W19-Redis-Scaling.md) | Week 19 | Redis + BullMQ Scaling | Phase 4 |
| [README-23-W20-Load-Testing.md](README-23-W20-Load-Testing.md) | Week 20 | k6 Load Testing Suite | Phase 4 |
| [README-24-W21-Frontend-Perf.md](README-24-W21-Frontend-Perf.md) | Week 21 | Frontend Performance + Bundles | Phase 4 |
| [README-25-W22-Resilience.md](README-25-W22-Resilience.md) | Week 22 | Circuit Breakers + Graceful Shutdown | Phase 4 |
| [README-26-W23-Security.md](README-26-W23-Security.md) | Week 23 | Security Hardening + OWASP | Phase 5 |
| [README-27-W24-Admin-Module.md](README-27-W24-Admin-Module.md) | Week 24 | Admin Module + Routing Rules | Phase 5 |
| [README-28-W25-Notifications.md](README-28-W25-Notifications.md) | Week 25 | Email + Notifications | Phase 5 |
| [README-29-W26-UAT.md](README-29-W26-UAT.md) | Week 26 | Staging + UAT | Phase 5 |
| [README-30-W27-GoLive-Prep.md](README-30-W27-GoLive-Prep.md) | Week 27 | Go-Live Preparation | Phase 5 |
| [README-31-W28-GoLive.md](README-31-W28-GoLive.md) | Week 28 | Go-Live + Hypercare | Phase 5 |

---

## 🏗 Tech Stack (Locked — Do Not Change)

| Layer | Technology |
|-------|-----------|
| API | Express.js 4.x + TypeScript 5 strict |
| Frontend | Next.js 14 App Router |
| ORM | Prisma 5.x (ACID, migrations) |
| Auth | Keycloak 24 + JWT + JWKS |
| Queue | BullMQ 5.x on Redis 7 |
| Search | Meilisearch v1.7 |
| Real-time | Socket.IO 4.x + Redis adapter |
| Storage | MinIO (S3-compatible, AES-256) |
| Telephony | FreeSWITCH + SIP.js |
| Proxy | Traefik v3 |
| Observability | Prometheus + Grafana + Loki |

---

## ⚠️ Critical Rules for AI IDE

1. **Always complete the Verification Step** before pasting the next README
2. **Never skip sub-prompts** — W2a before W2b, W4a before W4b, W7a before W7b
3. **Commit after each passing prompt**: `git commit -m "feat: week-X complete"`
4. **`express-async-errors` must be the FIRST import** in `apps/api/src/index.ts`
5. **Use `prisma.$transaction([])`** for all multi-step DB writes
6. If the AI IDE produces code without Zod validation on POST/PATCH routes, ask it to add `validateBody(schema)` middleware

---

## 🚦 Phase Summary

| Phase | Weeks | Goal |
|-------|-------|------|
| **P1 — Foundation** | 1–5 | Infra, DB, Auth, Case CRUD, Agent Desktop |
| **P2 — Core Ops** | 6–11 | SLA Engine, Telephony, Recordings, Supervisor |
| **P3 — QA & Compliance** | 12–17 | QA Module, Audit, Reports, CSAT, KB, Observability |
| **P4 — Scalability** | 18–22 | DB Tuning, Load Tests, Frontend Perf, Resilience |
| **P5 — Go-Live** | 23–28 | Security, Admin, Notifications, UAT, Launch |
