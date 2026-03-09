# WEEK 3 — Keycloak RBAC & Auth Middleware
## Phase 1 · CCMP

> **Prerequisite:** Week 2b complete. Express server starts. Health endpoint returns 200.
> **Paste this entire file into your AI IDE.**

---

## 🎯 CONTEXT

Week 3. Express server boots correctly from Week 2b. Now implement authentication: Keycloak realm configuration, JWT validation Express middleware, and Next.js auth integration using next-auth with the Keycloak provider.

After this week, every API route can be protected with `authenticate` and `requireRole([...])` middleware.

---

## 📋 TASK

### 1. `config/keycloak/realm-export.json`

Create a Keycloak realm JSON with these exact settings:
- `realm`: `"ccmp"`
- `enabled`: true
- `sslRequired`: `"external"` (development) — change to `"all"` before production
- `bruteForceProtected`: true
- `failureFactor`: 10
- `maxFailureWaitSeconds`: 900
- `passwordPolicy`: `"length(12) and upperCase(1) and digits(1) and specialChars(1)"`
- `defaultRequiredActions`: `["VERIFY_EMAIL", "UPDATE_PASSWORD"]`
- Roles: `AGENT`, `SENIOR_AGENT`, `SUPERVISOR`, `QA_ANALYST`, `OPERATIONS_MANAGER`, `COMPLIANCE_OFFICER`, `ADMIN`
- Clients:
  - `ccmp-web` — publicClient: true, redirectUris: `["http://localhost:3000/*"]`, webOrigins: `["+"]`
  - `ccmp-api` — publicClient: false, serviceAccountsEnabled: true, directAccessGrantsEnabled: true

### 2. `apps/api/src/middleware/auth.ts`

```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { UnauthorizedError, ForbiddenError } from '../lib/errors';
import { logger } from '../lib/logger';

const client = jwksClient({
  jwksUri: `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM || 'ccmp'}/protocol/openid-connect/certs`,
  cache: true,
  rateLimit: true,
  jwksRequestsPerMinute: 10,
});

function getSigningKey(header: jwt.JwtHeader): Promise<string> {
  return new Promise((resolve, reject) => {
    client.getSigningKey(header.kid, (err, key) => {
      if (err) return reject(err);
      resolve(key!.getPublicKey());
    });
  });
}

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  sessionId: string;
  firstName?: string;
  lastName?: string;
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized', message: 'Missing Bearer token' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    // Decode header first to get kid
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded === 'string') {
      res.status(401).json({ error: 'Unauthorized', message: 'Invalid token format' });
      return;
    }

    const signingKey = await getSigningKey(decoded.header);

    const payload = jwt.verify(token, signingKey, {
      algorithms: ['RS256'],
      issuer: `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM || 'ccmp'}`,
    }) as jwt.JwtPayload;

    const roles: string[] = payload.realm_access?.roles || [];
    const role = ['AGENT','SENIOR_AGENT','SUPERVISOR','QA_ANALYST','OPERATIONS_MANAGER','COMPLIANCE_OFFICER','ADMIN']
      .find(r => roles.includes(r));

    if (!role) {
      res.status(403).json({ error: 'Forbidden', message: 'No valid CCMP role assigned' });
      return;
    }

    req.user = {
      id: payload.sub!,
      email: payload.email || payload.preferred_username || '',
      role,
      sessionId: payload.sid || payload.jti || '',
      firstName: payload.given_name,
      lastName: payload.family_name,
    };

    next();
  } catch (err) {
    logger.warn({ err }, 'Token verification failed');
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Unauthorized', message: 'Token expired' });
    } else {
      res.status(401).json({ error: 'Unauthorized', message: 'Invalid token' });
    }
  }
}

export function requireRole(roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Run authenticate first
    await new Promise<void>((resolve) => authenticate(req, res, () => resolve()));

    // If authenticate already responded (error), stop here
    if (res.headersSent) return;

    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden', message: `Requires one of: ${roles.join(', ')}` });
      return;
    }

    next();
  };
}
```

### 3. `apps/web/package.json` additions

Add to dependencies:
```json
{
  "next-auth": "^4.24.7",
  "@auth/core": "^0.32.0"
}
```

### 4. `apps/web/src/app/api/auth/[...nextauth]/route.ts`

```typescript
import NextAuth, { NextAuthOptions } from 'next-auth';
import KeycloakProvider from 'next-auth/providers/keycloak';

export const authOptions: NextAuthOptions = {
  providers: [
    KeycloakProvider({
      clientId: process.env.KEYCLOAK_CLIENT_ID || 'ccmp-web',
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || '',
      issuer: `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM || 'ccmp'}`,
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.idToken = account.id_token;
        // Extract CCMP role from Keycloak realm_access
        const roles = (profile as any)?.realm_access?.roles || [];
        token.role = ['AGENT','SENIOR_AGENT','SUPERVISOR','QA_ANALYST','OPERATIONS_MANAGER','COMPLIANCE_OFFICER','ADMIN']
          .find((r) => roles.includes(r)) || 'AGENT';
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      session.user.role = token.role as string;
      session.user.id = token.sub!;
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/auth/error',
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

### 5. `apps/web/src/middleware.ts`

```typescript
export { default } from 'next-auth/middleware';

export const config = {
  matcher: [
    '/((?!login|api/auth|_next/static|_next/image|favicon.ico|survey).*)',
  ],
};
```

### 6. `apps/web/src/types/next-auth.d.ts`

```typescript
import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    accessToken: string;
    user: {
      id: string;
      role: string;
      email: string;
      name?: string;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    idToken?: string;
    role?: string;
  }
}
```

---

## ⚙️ CONSTRAINTS

- JWKS client: `cache: true, rateLimit: true` — prevents hammering Keycloak on every request
- JWT decode before `getSigningKey` — use `decoded.header.kid` to fetch the correct key
- `authenticate` must **never throw** — always call `res.status().json()` and return
- `requireRole` must check `res.headersSent` after running authenticate to avoid double-response
- Token expiry returns 401 with distinct message from invalid token
- `realm_access.roles` is the correct path for Keycloak realm roles (not `resource_access`)
- Add `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET`, `KEYCLOAK_REALM` to `.env.example` if not there

---

## 📤 OUTPUT

1. `config/keycloak/realm-export.json`
2. `apps/api/src/middleware/auth.ts` (authenticate + requireRole)
3. `apps/web/src/app/api/auth/[...nextauth]/route.ts`
4. `apps/web/src/middleware.ts` (route protection)
5. `apps/web/src/types/next-auth.d.ts`

---

## ✅ VERIFICATION STEP

```bash
# 1. Import Keycloak realm
docker exec ccmp-keycloak /opt/keycloak/bin/kc.sh import \
  --file /opt/keycloak/data/import/realm-export.json --override true

# 2. Start API
pnpm --filter @ccmp/api dev &
sleep 3

# 3. Test — no token → 401
curl -s -X GET http://localhost:4000/api/v1/cases \
  -H "Content-Type: application/json" | jq .
# EXPECT: {"error":"Unauthorized","message":"Missing Bearer token"}

# 4. Get a test token from Keycloak (create a test user first via Keycloak admin)
# Then test with valid token:
TOKEN="eyJ..."  # paste token here
curl -s http://localhost:4000/api/v1/cases \
  -H "Authorization: Bearer $TOKEN" | jq .
# Note: /api/v1/cases returns 404 until Week 4 — that's expected

# 5. Test expired token
# Use an old/invalid token:
curl -s http://localhost:4000/api/v1/cases \
  -H "Authorization: Bearer invalid.token.here" | jq .
# EXPECT: {"error":"Unauthorized","message":"Invalid token"}

# 6. Commit
git add . && git commit -m "feat: week-3 auth middleware complete"
```

**Next:** `README-05-W4a-Case-Service.md`
