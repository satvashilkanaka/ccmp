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
