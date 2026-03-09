import { Router } from 'express';
import { requireRole } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { auditService } from './audit.service.js';
import { AuditExportSchema } from './audit.dto.js';
import { logger } from '../../lib/logger.js';

export const auditRouter = Router();

// Only Compliance Officers and Admins can access the audit module
const AUDIT_ROLES = ['COMPLIANCE_OFFICER', 'ADMIN'];

// ── GET /audit/logs ───────────────────────────────────────────────────────────
auditRouter.get('/logs', requireRole(AUDIT_ROLES), async (req, res) => {
  const { actorId, resourceType, resourceId, action, startDate, endDate, limit, offset } = req.query;

  const filters = {
    actorId: actorId as string | undefined,
    resourceType: resourceType as string | undefined,
    resourceId: resourceId as string | undefined,
    action: action as string | undefined,
    startDate: startDate ? new Date(startDate as string) : undefined,
    endDate: endDate ? new Date(endDate as string) : undefined,
    limit: limit ? parseInt(limit as string, 10) : 50,
    offset: offset ? parseInt(offset as string, 10) : 0,
  };

  const results = await auditService.getAuditLogs(filters);
  res.json(results);
});

// ── GET /audit/access-history/:userId ─────────────────────────────────────────
auditRouter.get('/access-history/:userId', requireRole(AUDIT_ROLES), async (req, res) => {
  const { userId } = req.params;
  const { limit, offset } = req.query;

  const _limit = limit ? parseInt(limit as string, 10) : 50;
  const _offset = offset ? parseInt(offset as string, 10) : 0;

  const results = await auditService.getUserAccessHistory(userId, _limit, _offset);
  res.json(results);
});

// ── POST /audit/export ────────────────────────────────────────────────────────
auditRouter.post('/export', requireRole(AUDIT_ROLES), validateBody(AuditExportSchema), async (req, res) => {
  const exporterId = req.user!.id;
  const { actorId, resourceType, resourceId, action, startDate, endDate } = req.body;

  const filters = {
    actorId,
    resourceType,
    resourceId,
    action,
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
  };

  try {
    const pdfBuffer = await auditService.exportAuditTrail(filters, exporterId);
    
    // Log the act of exporting
    // Note: this should be logged natively by our auditSelf middleware soon, 
    // but just in case, we log it locally here too via pino.
    logger.info({ exporterId, action: 'export_audit_trail' }, 'Audit trail exported');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ccmp_audit_export_${Date.now()}.pdf"`);
    res.send(pdfBuffer);
  } catch (err: any) {
    logger.error({ err }, 'Failed to export audit trail');
    res.status(500).json({ error: 'Failed to generate audit export' });
  }
});
