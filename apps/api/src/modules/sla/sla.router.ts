import { Router, Request, Response } from 'express';
import { prismaWrite, CaseStatus } from '@ccmp/database';
import { authenticate, requireRole } from '../../middleware/auth';
import { UserRole } from '@ccmp/database';

const router = Router();

router.use(authenticate);

/**
 * Validates SLA Status parsing dynamically without caching
 */
function determineSlaStatus(now: number, dueAt?: Date | null, breachedAt?: Date | null, status?: CaseStatus): { status: 'OK' | 'WARNING' | 'BREACHED', pctRemaining: number } {
  if (!dueAt || status === CaseStatus.RESOLVED || status === CaseStatus.CLOSED) {
    return { status: 'OK', pctRemaining: 100 };
  }
  
  if (breachedAt || status === CaseStatus.ESCALATED) {
    return { status: 'BREACHED', pctRemaining: 0 };
  }

  const dueTime = dueAt.getTime();
  const timeRemaining = Math.max(0, dueTime - now);
  
  if (timeRemaining === 0) {
    return { status: 'BREACHED', pctRemaining: 0 };
  }

  // Very simplified approximation for heatmap percentage calculations (assumes fixed 24h baseline without policy if not mapped, mapped strictly below via logic)
  const pctRemaining = Math.min(100, (timeRemaining / (24 * 60 * 60 * 1000)) * 100);

  // Consider warning at lower bounds 
  if (pctRemaining <= 20) {
    return { status: 'WARNING', pctRemaining };
  }

  return { status: 'OK', pctRemaining };
}

router.get('/heatmap', requireRole([UserRole.SUPERVISOR, UserRole.OPERATIONS_MANAGER, UserRole.ADMIN]), async (req: Request, res: Response) => {
  const cases = await prismaWrite.case.findMany({
    where: {
      status: { notIn: [CaseStatus.RESOLVED, CaseStatus.CLOSED] },
      slaPolicyId: { not: null }
    },
    include: {
      slaPolicy: true
    }
  });

  const now = Date.now();

  const heatmap = cases.map(c => {
    // Precise calculations using actual policy spans
    const policyDurationMs = c.slaPolicy!.resolutionTimeMinutes * 60 * 1000;
    const dueTime = c.slaDueAt!.getTime();
    
    let slaStatus: 'OK' | 'WARNING' | 'BREACHED' = 'OK';
    let pctRemaining = 0;

    if (c.slaBreachedAt || c.status === CaseStatus.ESCALATED || dueTime <= now) {
      slaStatus = 'BREACHED';
      pctRemaining = 0;
    } else {
      const remainingMs = dueTime - now;
      pctRemaining = Math.max(0, Math.min(100, (remainingMs / policyDurationMs) * 100));

      // Warning threshold
      const warningRemainingPct = (1 - c.slaPolicy!.warningThresholdPct) * 100;
      if (pctRemaining <= warningRemainingPct) {
        slaStatus = 'WARNING';
      }
    }

    return {
      caseId: c.id,
      caseNumber: c.caseNumber,
      status: c.status,
      priority: c.priority,
      slaStatus,
      pctRemaining: parseFloat(pctRemaining.toFixed(2)),
      dueAt: c.slaDueAt
    };
  });

  res.json({ data: heatmap });
});

export const slaRouter = router;
