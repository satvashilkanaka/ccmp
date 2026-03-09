# WEEK 1 — Containerised Infrastructure
## Docker Compose + Traefik · Phase 1 · CCMP

> **Prerequisite:** Pre-flight complete. Directories created. `.env.example` exists.
> **Paste this entire file into your AI IDE.**

---

## 🎯 CONTEXT

You are building the CCMP monorepo. Week 1 of 28. The full infrastructure stack must be stood up in Docker Compose with Traefik as the reverse proxy. **No application code is written this week** — infrastructure containers only.

The codebase currently has only the scaffold from pre-flight (empty directories, config files). Your task is to create all Docker and infrastructure configuration files.

---

## 📋 TASK

### 1. `docker-compose.yml` (repo root)

Create a complete Docker Compose v2 file (no `version:` key) with these services on a `ccmp-network` bridge:

**`traefik`** — reverse proxy
- Image: `traefik:v3.0`
- Ports: `80:80`, `443:443`, `8080:8080` (dashboard)
- Volumes: `/var/run/docker.sock:/var/run/docker.sock:ro`, `./config/traefik:/etc/traefik`
- Labels: enable Traefik

**`postgres`** (container_name: `ccmp-postgres`)
- Image: `postgres:16-alpine`
- Environment: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` from env vars
- Volumes: `postgres_data:/var/lib/postgresql/data`
- Health check: `pg_isready -U ccmp_user -d ccmp` — interval 10s, retries 5, start_period 30s
- Ports: `5432:5432`

**`pgbouncer`**
- Image: `bitnami/pgbouncer:latest`
- Depends on: `postgres` (condition: service_healthy)
- Environment: `POSTGRESQL_HOST=postgres`, `POSTGRESQL_PORT=5432`, `PGBOUNCER_POOL_MODE=transaction`, `PGBOUNCER_MAX_CLIENT_CONN=500`, `PGBOUNCER_DEFAULT_POOL_SIZE=20`, `POSTGRESQL_USERNAME`, `POSTGRESQL_PASSWORD`, `POSTGRESQL_DATABASE`
- Ports: `6432:6432`

**`redis`** (container_name: `ccmp-redis`)
- Image: `redis:7-alpine`
- Command: `redis-server --requirepass ${REDIS_PASSWORD} --maxmemory 512mb --maxmemory-policy allkeys-lru`
- Volumes: `redis_data:/data`
- Health check: `redis-cli -a $$REDIS_PASSWORD ping` — interval 10s, retries 5
- Ports: `6379:6379`

**`keycloak`** (container_name: `ccmp-keycloak`)
- Image: `quay.io/keycloak/keycloak:24.0`
- Command: `start-dev --import-realm`
- Environment: `KEYCLOAK_ADMIN`, `KEYCLOAK_ADMIN_PASSWORD`, `KC_DB=dev-file`, `KC_HTTP_PORT=8180`
- Volumes: `./config/keycloak:/opt/keycloak/data/import`
- Ports: `8180:8180`
- Health check: `curl -f http://localhost:8180/health/ready` — interval 15s, retries 8, start_period 60s

**`minio`**
- Image: `minio/minio:latest`
- Command: `server /data --console-address ":9001"`
- Environment: `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`
- Volumes: `minio_data:/data`
- Ports: `9000:9000`, `9001:9001`
- Health check: `curl -f http://localhost:9000/minio/health/live` — interval 10s, retries 5

**`meilisearch`**
- Image: `getmeili/meilisearch:v1.7`
- Environment: `MEILI_MASTER_KEY`, `MEILI_ENV=development`
- Volumes: `meilisearch_data:/meili_data`
- Ports: `7700:7700`
- Health check: `curl -f http://localhost:7700/health` — interval 10s, retries 5

**Named volumes:** `postgres_data`, `redis_data`, `minio_data`, `meilisearch_data`

**Network:** `ccmp-network` driver bridge

---

### 2. `config/traefik/traefik.yml`

```yaml
api:
  dashboard: true
  insecure: true  # dev only — disable in production

entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https
  websecure:
    address: ":443"

providers:
  docker:
    exposedByDefault: false
    network: ccmp-network
  file:
    directory: /etc/traefik/dynamic
    watch: true

certificatesResolvers:
  letsencrypt:
    acme:
      email: devops@yourdomain.com
      storage: /etc/traefik/acme.json
      httpChallenge:
        entryPoint: web

log:
  level: INFO

accessLog: {}
```

### 3. `config/traefik/dynamic/middlewares.yml`

```yaml
http:
  middlewares:
    compress:
      compress: {}
    ratelimit:
      rateLimit:
        average: 200
        burst: 50
    secureHeaders:
      headers:
        stsSeconds: 31536000
        stsIncludeSubdomains: true
        forceSTSHeader: true
        frameDeny: true
        contentTypeNosniff: true
        browserXssFilter: true
```

### 4. `config/redis/redis.conf`

```
maxmemory 512mb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
appendonly yes
appendfsync everysec
```

---

## ⚙️ CONSTRAINTS

- Docker Compose v2 syntax — **no `version:` key at the top**
- All secrets via `${ENV_VAR}` references — zero hardcoded passwords
- All services on `ccmp-network` bridge
- Health checks required on `postgres`, `redis`, `keycloak`, `minio`, `meilisearch`
- `pgbouncer` must have `depends_on: postgres: condition: service_healthy`
- FreeSWITCH is **NOT added yet** — it will be added in Week 7
- Traefik dashboard enabled (`insecure: true`) is acceptable for development

---

## 📤 OUTPUT

- `docker-compose.yml` (all 7 services)
- `config/traefik/traefik.yml`
- `config/traefik/dynamic/middlewares.yml`
- `config/redis/redis.conf`
- Empty placeholder files: `config/keycloak/.gitkeep`, `config/prometheus/.gitkeep`

---

## ✅ VERIFICATION STEP

```bash
# 1. Validate compose syntax
docker compose config --quiet && echo "✅ Compose syntax valid"

# 2. Start all services
cp .env.example .env
# Edit .env and set real passwords first, then:
docker compose up -d

# 3. Wait ~60 seconds, then check all healthy
docker compose ps
# EXPECT: All services show (healthy) or running

# 4. Test each service
curl -s http://localhost:9000/minio/health/live && echo "✅ MinIO OK"
curl -s http://localhost:7700/health | grep '"status":"available"' && echo "✅ Meilisearch OK"
curl -s http://localhost:8080/api/rawdata | head -c 50 && echo "✅ Traefik OK"
docker exec ccmp-postgres pg_isready -U ccmp_user -d ccmp && echo "✅ Postgres OK"
docker exec ccmp-redis redis-cli -a $REDIS_PASSWORD ping && echo "✅ Redis OK"

# 5. Commit
git add . && git commit -m "feat: week-1 infrastructure complete"
```

**Next:** `README-02-W2a-Database-Schema.md`
