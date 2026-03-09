# WEEK 26 — Staging Environment & UAT

## User Acceptance Testing · Phase 5 · CCMP

> **Prerequisite:** Week 25 complete. All notifications working.
> **Paste this entire file into your AI IDE.**

---

## 📋 TASK

1. **`docker-compose.staging.yml`** — staging overlay with production-like settings: `NODE_ENV=production`, no Traefik dashboard, TLS enabled, separate volume names.

2. **`scripts/provision-uat-accounts.sh`** — create 5 Keycloak test accounts:

```bash
#!/bin/bash
# Creates UAT test accounts in Keycloak
KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8180}"
REALM="ccmp"

create_user() {
  local username="$1" password="$2" role="$3" firstName="$4" lastName="$5"
  # Get admin token
  ADMIN_TOKEN=$(curl -s -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
    -d "client_id=admin-cli&username=$KEYCLOAK_ADMIN&password=$KEYCLOAK_ADMIN_PASSWORD&grant_type=password" \
    | jq -r .access_token)

  # Create user
  USER_ID=$(curl -s -X POST "$KEYCLOAK_URL/admin/realms/$REALM/users" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$username\",\"email\":\"$username@uat.ccmp.com\",\"firstName\":\"$firstName\",\"lastName\":\"$lastName\",\"enabled\":true,\"credentials\":[{\"type\":\"password\",\"value\":\"$password\",\"temporary\":false}]}" \
    -D - | grep -i "location:" | awk -F'/' '{print $NF}' | tr -d '\r')

  # Assign role
  curl -s -X POST "$KEYCLOAK_URL/admin/realms/$REALM/users/$USER_ID/role-mappings/realm" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "[{\"name\":\"$role\"}]"

  echo "✅ Created $username ($role)"
}

create_user "uat-agent-1"     "UatPassword1!" "AGENT"      "Alice" "Agent"
create_user "uat-supervisor"  "UatPassword1!" "SUPERVISOR"  "Sam"   "Supervisor"
create_user "uat-qa"          "UatPassword1!" "QA_ANALYST"  "Quinn" "Analyst"
create_user "uat-compliance"  "UatPassword1!" "COMPLIANCE_OFFICER" "Carol" "Compliance"
create_user "uat-admin"       "UatPassword1!" "ADMIN"       "Adam"  "Admin"
```

3. **UAT test scripts** — 5 scenarios to execute manually with operations staff:

   - **UAT-01**: Agent logs in, receives a PHONE call, case created automatically, case resolved → CSAT email received
   - **UAT-02**: Supervisor monitors queue, reassigns case, triggers SLA override
   - **UAT-03**: QA Analyst completes a review with compliance flag → Compliance Officer notified
   - **UAT-04**: Admin creates a new routing rule → test case routes correctly
   - **UAT-05**: Compliance Officer exports audit trail → PDF downloadable with valid signature

4. **UAT issue tracker template**: `docs/uat/issue-template.md` — P0/P1/P2/P3 severity definitions.

---

## ⚙️ CONSTRAINTS

- **No go-live until written sign-off** from operations lead — verbal sign-off not accepted
- Fix all P0 (system down) and P1 (major feature broken) issues before proceeding to Week 27
- P2/P3 issues can be post-launch backlog
- Staging must use production-level data volumes (import anonymized production data if possible)

---

## ✅ VERIFICATION STEP

```bash
# Deploy to staging
docker compose -f docker-compose.yml -f docker-compose.staging.yml up -d

# Provision UAT accounts
./scripts/provision-uat-accounts.sh
# EXPECT: ✅ Created all 5 accounts

# Run all 5 UAT scripts with operations staff
# Document results in docs/uat/uat-results.md

# Get written sign-off email from operations lead before proceeding

git add .; git commit -m "feat: week-26 uat complete — sign-off obtained"
```

**Next:** `README-30-W27-GoLive-Prep.md`
