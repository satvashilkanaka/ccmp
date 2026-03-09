# WEEK 23 — Security Hardening

## OWASP + Keycloak MFA + Rate Limits + PII Audit · Phase 5 · CCMP

> **Prerequisite:** Week 22 complete. Phase 4 resilience tests pass.
> **Paste this entire file into your AI IDE.**

---

## 📋 TASK

1. **`apps/api/src/middleware/security.ts`** — `applySecurityMiddleware(app)` function called in `buildApp()` before all routes:

```typescript
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';

export function applySecurityMiddleware(app: Application) {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", "wss:", "ws:"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
    hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
  }));

  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || [],
    methods: ['GET','POST','PATCH','PUT','DELETE','OPTIONS'],
    allowedHeaders: ['Authorization','Content-Type','X-Idempotency-Key'],
    maxAge: 86400,
  }));

  // Global rate limit: 200 req/min
  const globalLimiter = rateLimit({ windowMs: 60_000, max: 200, standardHeaders: true, store: new RedisStore({ sendCommand: (...args: string[]) => redisClient.sendCommand(args) }) });
  app.use(globalLimiter);

  // Auth endpoints: 10 req/min
  const authLimiter = rateLimit({ windowMs: 60_000, max: 10, store: new RedisStore({...}) });
  app.use('/api/v1/auth', authLimiter);
}
```

2. **Keycloak hardening** — update `config/keycloak/realm-export.json`:

   - `sslRequired: "all"` (change from `"external"`)
   - `bruteForceProtected: true`, `failureFactor: 10`, `maxFailureWaitSeconds: 900`
   - MFA (`CONFIGURE_TOTP`) as `defaultRequiredAction` for: `SUPERVISOR`, `QA_ANALYST`, `COMPLIANCE_OFFICER`, `ADMIN`

3. **Zod validation audit** — add `validateBody(schema)` to ALL existing routes that are missing it. Create a helper script to audit which routes lack it.

4. **Dependency audit**: `pnpm audit --audit-level critical`. Fix all critical CVEs. Document high CVEs with remediation timeline in `docs/security/dependency-audit.md`.

5. **OWASP ZAP scan**: `docker run -t owasp/zap2docker-stable zap-api-scan.py -t http://staging-url/api/v1`. Save report to `docs/security/zap-report.json`. Fix all critical and high findings.

6. **PII audit script**: `scripts/pii-audit.sh` — grep Loki logs for email/card/phone/SSN patterns. Exit non-zero if PII found.

7. **CI security workflow**: `.github/workflows/security.yml` — run `pnpm audit` on every PR.

---

## ⚙️ CONSTRAINTS

- CSP: `frame-ancestors "none"` required for clickjacking protection
- CSP: `connectSrc` must include `wss:` for Socket.IO
- `RedisStore` for rate limiting: use `sendCommand` interface (not deprecated ioredis)
- Never hardcode secrets — add grep check in CI: `grep -r "password\s*=" --include="*.ts" src/`

---

## ✅ VERIFICATION STEP

```bash
# 1. Security headers
curl -I https://staging.ccmp.com | grep -E "strict-transport|content-security|x-frame"
# EXPECT: All 3 headers present

# 2. Rate limiting
for i in {1..12}; do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4000/api/v1/auth/token; done
# EXPECT: First 10 return 404/200, 11th+ return 429

# 3. ZAP scan zero criticals
cat docs/security/zap-report.json | jq '[.site[].alerts[] | select(.riskcode >= "2")] | length'
# EXPECT: 0

# 4. PII audit
./scripts/pii-audit.sh
# EXPECT: ✅ PASS: No PII found in logs

git add .; git commit -m "feat: week-23 security hardening complete"
```

**Next:** `README-27-W24-Admin-Module.md`
