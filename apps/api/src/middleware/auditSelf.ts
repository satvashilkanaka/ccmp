import { Request, Response, NextFunction } from 'express';
import { prismaWrite } from '@ccmp/database';
import { logger } from '../lib/logger.js';

/**
 * Middleware that logs actions taken by the authenticated user to the AuditLog table.
 * It observes the HTTP method and path to determine the action and resource type.
 */
export async function auditSelf(req: Request, res: Response, next: NextFunction) {
  // Capture original `end` to hook into when the request finishes
  const originalEnd = res.end;
  
  // We only log if the user was authenticated and it was a mutating action or read action we care about.
  // Note: in a production scenario, you might want much more granular hooks,
  // but a middleware approach works for generalized access logging.
  res.end = function (...args: any[]) {
    // Call the original res.end first so we don't block the response
    originalEnd.apply(res, args as any);

    // Run audit logic async
    setImmediate(() => {
      try {
        logRequestContext(req, res);
      } catch (err) {
        logger.error({ err }, 'auditSelf middleware failed to write to database');
      }
    });

    return this;
  };

  next();
}

/**
 * Derives context for audit logging based on the method and route.
 */
async function logRequestContext(req: Request, res: Response) {
  // Ignore preflight requests
  if (req.method === 'OPTIONS') return;

  // We need an authenticated user to perform self-audit
  const user = req.user;
  if (!user) return;

  // Derive simple resourceType and action from the HTTP request
  let action = 'viewed';
  switch (req.method) {
    case 'POST':
      action = 'created';
      break;
    case 'PUT':
    case 'PATCH':
      action = 'updated';
      break;
    case 'DELETE':
      action = 'deleted';
      break;
    case 'GET':
    default:
      action = 'viewed';
      break;
  }

  // Very naive extraction: take the first noun after /api/v1/ as the resource type
  // e.g. /api/v1/cases/123 -> resourceType: 'cases'
  let resourceType = 'unknown';
  let resourceId = null;

  const match = req.originalUrl.match(/^\/api\/v1\/([^/?]+)(?:\/([^/?]+))?/);
  if (match) {
    resourceType = match[1];
    // If the next path segment exists and looks like an ID (not an action like 'export'), capture it
    if (match[2] && !['export', 'search', 'queue', 'logs'].includes(match[2])) {
      resourceId = match[2];
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // INFINITE LOOP GUARD
  // Prevent infinite loops if the resource type is 'audit' or 'audit_log'.
  // If we don't, fetching the audit log creates an audit log, ad infinitum.
  // ────────────────────────────────────────────────────────────────────────────
  if (resourceType === 'audit' || resourceType === 'audit_logs') {
    return;
  }
  
  // Exclude healthchecks and certain high-volume polling endpoints from creating noise
  if (resourceType === 'health' || resourceType === 'supervisor') {
    return;
  }

  // Prevent breaking unit tests that heavily mock the database but still run the global app router
  if (process.env.NODE_ENV === 'test') return;

  // Best effort non-blocking write
  prismaWrite.auditLog
    .create({
      data: {
        actorId: user.id,
        actorEmail: user.email,
        action,
        resourceType,
        resourceId,
        ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
        payload: {
          path: req.originalUrl,
          statusCode: res.statusCode,
        },
      },
    })
    .catch((err) => {
      logger.error({ err }, 'Failed to write audit log in async hook');
    });
}
