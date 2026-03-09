import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger.js';
import { prismaWrite } from '@ccmp/database';

/**
 * Middleware to audit administrative mutations.
 * Logs POST, PATCH, PUT, and DELETE requests to the AuditLog table.
 */
export async function adminAuditMiddleware(req: Request, res: Response, next: NextFunction) {
  const metaMethods = ['POST', 'PATCH', 'PUT', 'DELETE'];
  
  if (!metaMethods.includes(req.method)) {
    return next();
  }

  const startTime = Date.now();

  res.on('finish', async () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      try {
        await prismaWrite.auditLog.create({
          data: {
            actorId: (req as any).user?.id,
            actorEmail: (req as any).user?.email,
            action: `ADMIN_${req.method}_${req.path.split('/').pop()?.toUpperCase() || 'UNKNOWN'}`,
            resourceType: 'ADMIN_MODULE',
            resourceId: req.params.id || 'N/A',
            payload: {
              method: req.method,
              path: req.path,
              body: req.body,
              statusCode: res.statusCode,
              durationMs: Date.now() - startTime,
            },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
          },
        });
      } catch (err: any) {
        logger.error({ err }, 'Failed to create Admin AuditLog');
      }
    }
  });

  next();
}
