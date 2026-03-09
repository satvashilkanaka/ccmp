# PRE-FLIGHT — Environment Setup
## Run this BEFORE Week 1 · CCMP Implementation

> **Paste this entire file into your AI IDE.** The AI will scaffold your environment config files. You run the shell commands yourself.

---

## 🎯 CONTEXT

You are setting up the local development environment for the CCMP (Contact Centre Management Platform) — a 28-week build. This is the pre-work step. No application code is written yet.

**Stack:** Express.js 4.x · Next.js 14 · TypeScript 5 strict · Prisma 5 · PostgreSQL 16 · Redis 7 · Keycloak 24 · MinIO · Meilisearch 1.7 · FreeSWITCH · Traefik v3 · BullMQ 5 · Socket.IO 4

---

## 📋 TASK

Generate the following files exactly as specified:

### 1. `setup.sh` (repo root)

```bash
#!/bin/bash
# setup.sh — CCMP local environment bootstrap
# Usage: chmod +x setup.sh && ./setup.sh
set -euo pipefail

echo "=== CCMP Setup ==="

# 1. Node.js via nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install 22 && nvm use 22 && nvm alias default 22
echo "Node: $(node --version)"

# 2. pnpm
npm install -g pnpm@9
echo "pnpm: $(pnpm --version)"

# 3. Install monorepo dependencies
pnpm install

# 4. Copy .env
if [ ! -f .env ]; then
  cp .env.example .env
  echo "⚠️  .env created — fill in passwords before continuing"
fi

# 5. Start infrastructure containers
docker compose up -d postgres redis keycloak minio meilisearch traefik

# 6. Wait for Postgres
echo "Waiting for Postgres..."
until docker exec ccmp-postgres pg_isready -U ccmp_user -d ccmp; do sleep 2; done

# 7. Run Prisma migrations + seed
pnpm --filter @ccmp/database prisma migrate dev
pnpm --filter @ccmp/database prisma db seed

# 8. Keycloak realm import (idempotent)
docker exec ccmp-keycloak /opt/keycloak/bin/kc.sh import \
  --file /opt/keycloak/data/import/realm.json \
  --override true 2>/dev/null || true

# 9. MinIO bucket setup
pnpm --filter @ccmp/api tsx scripts/setup-minio.ts

# 10. Meilisearch index setup
pnpm --filter @ccmp/database tsx src/search/meilisearch.ts --setup

echo ""
echo "✅ Setup complete!"
echo "  API:      http://localhost:4000"
echo "  Web:      http://localhost:3000"
echo "  Keycloak: http://localhost:8180"
echo "  MinIO:    http://localhost:9001"
echo "  Traefik:  http://localhost:8080"
echo ""
echo "Next: pnpm dev"
```

### 2. `.env.example` (repo root)

```env
# ── Database ─────────────────────────────────────────────────────────────────
POSTGRES_USER=ccmp_user
POSTGRES_PASSWORD=CHANGE_ME_strong_password
POSTGRES_DB=ccmp
DATABASE_URL=postgresql://ccmp_user:CHANGE_ME_strong_password@localhost:6432/ccmp
DATABASE_READ_URL=postgresql://ccmp_user:CHANGE_ME_strong_password@localhost:5433/ccmp

# ── Redis ────────────────────────────────────────────────────────────────────
REDIS_PASSWORD=CHANGE_ME_redis_password
REDIS_URL=redis://:CHANGE_ME_redis_password@localhost:6379

# ── Keycloak ─────────────────────────────────────────────────────────────────
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=CHANGE_ME_keycloak_admin
KEYCLOAK_URL=http://localhost:8180
KEYCLOAK_REALM=ccmp
KEYCLOAK_API_CLIENT_ID=ccmp-api
KEYCLOAK_API_SECRET=CHANGE_ME_client_secret

# ── MinIO ────────────────────────────────────────────────────────────────────
MINIO_ROOT_USER=ccmp_admin
MINIO_ROOT_PASSWORD=CHANGE_ME_minio_password
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_RECORDINGS_BUCKET=ccmp-recordings

# ── Meilisearch ───────────────────────────────────────────────────────────────
MEILI_MASTER_KEY=CHANGE_ME_32_char_minimum_key_here
MEILI_URL=http://localhost:7700

# ── Application ───────────────────────────────────────────────────────────────
NODE_ENV=development
API_PORT=4000
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_WS_URL=http://localhost:4000
ALLOWED_ORIGINS=http://localhost:3000

# ── JWT ──────────────────────────────────────────────────────────────────────
JWT_SECRET=CHANGE_ME_jwt_fallback_secret_min_32_chars

# ── Phase 2+ (fill in when reaching those weeks) ──────────────────────────────
FREESWITCH_HOST=localhost
FREESWITCH_ESL_PORT=8021
FREESWITCH_ESL_PASSWORD=ClueCon
RECORDING_RETENTION_DAYS=90

# ── Phase 3+ ─────────────────────────────────────────────────────────────────
AUDIT_EXPORT_PRIVATE_KEY=
CSAT_TOKEN_SECRET=CHANGE_ME_csat_secret_min_32_chars

# ── Phase 4+ ─────────────────────────────────────────────────────────────────
REPLICATION_PASSWORD=CHANGE_ME_replication_password

# ── Phase 5+ ─────────────────────────────────────────────────────────────────
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=postmaster@yourdomain.com
SMTP_PASSWORD=CHANGE_ME_smtp_password
EMAIL_FROM=noreply@yourdomain.com
```

### 3. `pnpm-workspace.yaml` (repo root)

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'workers'
```

### 4. Root `package.json` (repo root)

```json
{
  "name": "ccmp",
  "private": true,
  "scripts": {
    "dev": "pnpm --parallel --filter './apps/*' dev",
    "build": "pnpm --recursive build",
    "test": "pnpm --recursive test",
    "lint": "pnpm --recursive lint",
    "db:migrate": "pnpm --filter @ccmp/database prisma migrate dev",
    "db:seed": "pnpm --filter @ccmp/database prisma db seed",
    "db:reset": "pnpm --filter @ccmp/database prisma migrate reset",
    "db:studio": "pnpm --filter @ccmp/database prisma studio"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0",
    "eslint": "^8.57.0",
    "prettier": "^3.2.0",
    "vitest": "^1.6.0",
    "@vitest/coverage-v8": "^1.6.0"
  }
}
```

### 5. Root `tsconfig.json` (repo root)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "paths": {
      "@ccmp/shared/*": ["./packages/shared/src/*"],
      "@ccmp/database/*": ["./packages/database/src/*"],
      "@ccmp/config/*": ["./packages/config/*"]
    }
  },
  "exclude": ["node_modules", "**/dist", "**/.next"]
}
```

### 6. Create this full directory tree

```
mkdir -p apps/api/src/{middleware,modules,lib,realtime,types}
mkdir -p apps/web/src/{app,components,hooks,lib}
mkdir -p apps/routing-service/src
mkdir -p packages/database/src/{search}
mkdir -p packages/database/prisma
mkdir -p packages/shared/src/{types}
mkdir -p packages/config
mkdir -p workers/src/processors
mkdir -p load-tests/scenarios
mkdir -p load-tests/results
mkdir -p scripts
mkdir -p config/{traefik,keycloak,prometheus,grafana/provisioning/dashboards,grafana/dashboards,freeswitch/conf/dialplan,redis}
mkdir -p docs/{adr,performance,security}
```

---

## ⚙️ CONSTRAINTS

- All environment variable values in `.env.example` must have a comment explaining what they're for
- `pnpm-workspace.yaml` must include `workers` as a standalone package
- Root `tsconfig.json` must include path aliases for all `@ccmp/*` packages
- Never commit the real `.env` — only `.env.example`
- `setup.sh` must be idempotent (safe to run twice)

---

## 📤 OUTPUT

- `setup.sh` (executable)
- `.env.example`
- `pnpm-workspace.yaml`
- Root `package.json`
- Root `tsconfig.json`
- All directories created

---

## ✅ VERIFICATION STEP

Run these commands yourself after the AI generates the files:

```bash
# 1. Verify directory structure
ls apps/ packages/ workers/ config/ docs/
# EXPECT: all directories present

# 2. Validate .env.example has all required keys
grep -c "=" .env.example
# EXPECT: 35 or more lines

# 3. Validate pnpm workspace
cat pnpm-workspace.yaml
# EXPECT: apps/*, packages/*, workers all listed

# 4. Test setup.sh syntax
bash -n setup.sh && echo "✅ setup.sh syntax OK"

# 5. Init git if not already done
git init && git add . && git commit -m "chore: project scaffold"
```

**Do NOT run `setup.sh` yet** — run it after Week 1 docker-compose is created.
