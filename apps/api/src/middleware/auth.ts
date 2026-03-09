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
