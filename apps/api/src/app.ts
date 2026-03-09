import 'express-async-errors'; // MUST BE FIRST IMPORT
import express, { Application, Request, Response, NextFunction } from 'express';
import http from 'http';
import pinoHttp from 'pino-http';
import { logger } from './lib/logger.js';
import { AppError } from './lib/errors.js';
import { authenticate, requireRole } from './middleware/auth.js';
import { metricsMiddleware, register, httpRequestErrorsTotal } from './middleware/metrics.js';
import { applySecurityMiddleware } from './middleware/security.js';
import { prismaRead } from '@ccmp/database';

import { casesRouter } from './modules/cases/cases.router.js';
import { recordingsRouter } from './modules/recordings/recordings.router.js';
import { supervisorRouter } from './modules/supervisor/supervisor.router.js';
import { qaRouter } from './modules/qa/qa.router.js';
import { auditRouter } from './modules/audit/audit.router.js';
import { surveyRouter } from './modules/csat/survey.router.js';
import { kbRouter } from './modules/kb/kb.router.js';
import { reportsRouter } from './modules/reports/reports.router.js';
import { adminRouter } from './modules/admin/admin.router.js';
import { adminAuditMiddleware } from './middleware/adminAudit.js';
import { preferencesRouter } from './modules/notifications/preferences.router.js';
import { auditSelf } from './middleware/auditSelf.js';
import { setupDocs } from './docs/swagger.js';

export function buildApp(): { app: Application; httpServer: http.Server } {
  const app = express();
  const httpServer = http.createServer(app);

  // ── Documentation ──────────────────────────────────────────────────────
  setupDocs(app);

  // ── Middleware ──────────────────────────────────────────────────────────
  applySecurityMiddleware(app);
  app.use(pinoHttp({ logger }));
  app.use(metricsMiddleware);
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ── Admin ──────────────────────────────────────────────────────────────
  app.use('/api/v1/admin', adminAuditMiddleware, adminRouter);

  // ── Notifications ───────────────────────────────────────────────────────
  app.use('/api/v1/notifications', preferencesRouter);

  // ── CSAT ──────────────────────────────────────────────────────────────
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', ts: new Date().toISOString(), version: process.env.npm_package_version });
  });

  // ── Public Routes ─────────────────────────────────────────────────────────
  
  // Expose Prometheus metrics internally (no auth required)
  app.get('/metrics', async (_req: Request, res: Response) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });

  app.use('/api/v1/survey', surveyRouter);

  // ── Auth Middleware ───────────────────────────────────────────────────────
  app.use('/api/v1', authenticate);

  // ── Audit Logging Middleware ──────────────────────────────────────────────
  app.use('/api/v1', auditSelf);

  // ── Routes ────────────────────────────────────────────────────────────────
  app.use('/api/v1/cases', casesRouter);
  app.use('/api/v1/recordings', recordingsRouter);
  app.use('/api/v1/supervisor', supervisorRouter);
  app.use('/api/v1/qa', qaRouter);
  app.use('/api/v1/audit', auditRouter);
  app.use('/api/v1/kb', kbRouter);
  app.use('/api/v1/reports', reportsRouter);

  // ── Admin Routes ──────────────────────────────────────────────────────────
  app.get('/api/v1/admin/replica-lag', requireRole(['ADMIN']), async (_req: Request, res: Response) => {
    try {
      const result = await prismaRead.$queryRaw<any[]>`
        SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp())) AS lag_seconds
      `;
      const lagSeconds = result[0]?.lag_seconds || 0;
      
      // Convert to milliseconds and cap float precision
      const lagMs = Math.round(Number(lagSeconds) * 1000);
      res.json({ lagMs });
    } catch (err: any) {
      // If we are hitting an environment without replication configured (like dev or testing directly),
      // pg_last_xact_replay_timestamp() can return null or error if not in recovery.
      // We safely fall back to 0 so the endpoints remain idempotent.
      logger.error({ err }, 'Failed to query replica lag');
      res.json({ lagMs: 0 });
    }
  });

  // ── 404 handler ─────────────────────────────────────────────────────────
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not Found' });
  });

  // ── Global error handler ─────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, 'Unhandled error');

    // Handle circuit breaker open state (added Week 22)
    if (err.constructor?.name === 'OpenCircuitError') {
      res.status(503).json({ error: 'Service temporarily unavailable — circuit open' });
      return;
    }

    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }

    // Prisma errors
    if ((err as any).code === 'P2025') {
      res.status(404).json({ error: 'Record not found' });
      return;
    }
    if ((err as any).code === 'P2002') {
      res.status(409).json({ error: 'Resource already exists' });
      return;
    }

    // Default 500 handler — Track explicitly in Prometheus
    httpRequestErrorsTotal.inc({ method: _req.method, path: _req.path });
    
    res.status(500).json({
      error: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message,
    });
  });

  return { app, httpServer };
}
