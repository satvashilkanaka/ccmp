import { prismaWrite, prismaRead, CaseStatus, UserRole } from '@ccmp/database';
import { createClient } from 'redis';
import { slaService } from '../sla/sla.service.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const pubClient = createClient({ url: redisUrl });
const redisClient = createClient({ url: redisUrl });

Promise.all([pubClient.connect(), redisClient.connect()]).catch(logger.error);

export class SupervisorService {
  /**
   * Promise.all for parallel DB + Redis fetching.
   */
  async getLiveQueueData() {
    const [dbCounts, callKeys] = await Promise.all([
      prismaRead.case.groupBy({
        by: ['status'],
        _count: { id: true },
        where: { deletedAt: null },
      }),
      redisClient.keys('ccmp:call:*'),
    ]);

    const activeCalls = await Promise.all(
      callKeys.map((k) => redisClient.hGetAll(k))
    );

    return {
      caseCountsByStatus: dbCounts.reduce((acc, curr) => {
        acc[curr.status] = curr._count.id;
        return acc;
      }, {} as Record<string, number>),
      activeCalls,
    };
  }

  /**
   * Reassigns a case, notifying both old and new agents.
   */
  async reassignCase(caseId: string, newAgentId: string, actorId: string, version: number) {
    const freshCase = await prismaRead.case.findUnique({ where: { id: caseId } });
    if (!freshCase) throw new NotFoundError('Case not found');

    const oldAgentId = freshCase.assignedToId;

    await prismaWrite.$transaction(async (tx) => {
      const result = await tx.case.updateMany({
        where: { id: caseId, version },
        data: {
          assignedToId: newAgentId,
          version: { increment: 1 },
        },
      });

      if (result.count === 0) {
        throw new ConflictError('Case was modified by another user — please refresh');
      }

      await tx.caseEvent.create({
        data: {
          caseId,
          eventType: 'REASSIGNED',
          actorId,
          payload: { oldAgentId, newAgentId },
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'CASE_REASSIGNED',
          resourceType: 'CASE',
          resourceId: caseId,
          actorId,
          payload: { oldAgentId, newAgentId },
        },
      });
    });

    if (oldAgentId) {
      await pubClient.publish('case:removed', JSON.stringify({ caseId, agentId: oldAgentId }));
    }
    await pubClient.publish('case:assigned', JSON.stringify({ caseId, agentId: newAgentId }));

    return { success: true, caseId, newAgentId };
  }

  /**
   * Forces an escalation (reuses breach logic).
   */
  async forceEscalate(caseId: string, actorId: string, version: number) {
    const freshCase = await prismaRead.case.findUnique({
      where: { id: caseId },
      include: { assignedTo: true },
    });
    if (!freshCase) throw new NotFoundError('Case not found');

    const CHAIN: UserRole[] = [UserRole.SENIOR_AGENT, UserRole.SUPERVISOR, UserRole.OPERATIONS_MANAGER];
    let nextRole: UserRole = UserRole.SUPERVISOR;
    if (freshCase.assignedTo?.role) {
      const idx = CHAIN.indexOf(freshCase.assignedTo.role as UserRole);
      nextRole = idx >= 0 && idx < CHAIN.length - 1 ? CHAIN[idx + 1] : UserRole.OPERATIONS_MANAGER;
    }

    await prismaWrite.$transaction(async (tx) => {
      const result = await tx.case.updateMany({
        where: { id: caseId, version },
        data: {
          status: CaseStatus.ESCALATED,
          slaBreachedAt: new Date(),
          version: { increment: 1 },
        },
      });

      if (result.count === 0) {
        throw new ConflictError('Case was modified by another user');
      }

      await tx.caseEvent.create({
        data: {
          caseId,
          eventType: 'SLA_BREACHED',
          actorId,
          payload: { escalatedRoleTarget: nextRole, forced: true },
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'SLA_BREACH_ESCALATED',
          resourceType: 'CASE',
          resourceId: caseId,
          actorId,
          payload: { nextRole, forced: true },
        },
      });
    });

    await pubClient.publish('sla:breached', JSON.stringify({
      caseId,
      escalated: true,
      timestamp: new Date().toISOString(),
    }));

    return { success: true, caseId, status: CaseStatus.ESCALATED };
  }

  /**
   * Overrides SLA due date and reschedules jobs.
   */
  async overrideSla(caseId: string, newSlaTarget: Date, actorId: string) {
    const caseObj = await prismaRead.case.findUnique({
      where: { id: caseId },
      include: { slaPolicy: true },
    });

    if (!caseObj) throw new NotFoundError('Case not found');

    // Cancel existing jobs
    await slaService.cancelSlaJobs(caseId);

    // Update DB
    await prismaWrite.case.update({
      where: { id: caseId },
      data: { slaDueAt: newSlaTarget },
    });

    // Schedule new jobs based on newSlaTarget
    const now = Date.now();
    const breachDelay = Math.max(0, newSlaTarget.getTime() - now);
    await slaService.scheduleBreach(caseId, breachDelay);

    // For warning, if we have a policy, assume warning threshold applies to the new duration
    if (caseObj.slaPolicy) {
      const totalDuration = newSlaTarget.getTime() - caseObj.createdAt.getTime();
      const warningDelay = Math.max(0, (caseObj.createdAt.getTime() + (totalDuration * caseObj.slaPolicy.warningThresholdPct)) - now);
      await slaService.scheduleWarning(caseId, warningDelay);
    }

    await prismaWrite.auditLog.create({
      data: {
        action: 'SLA_OVERRIDDEN',
        resourceType: 'CASE',
        resourceId: caseId,
        actorId,
        payload: { newSlaTarget },
      },
    });

    await pubClient.publish('sla:overridden', JSON.stringify({
      caseId,
      newSlaTarget: newSlaTarget.toISOString(),
      timestamp: new Date().toISOString(),
    }));

    return { success: true, newSlaTarget };
  }

  /**
   * Calculates heatmap data for active cases with SLAs.
   */
  async getSlaHeatmap() {
    const activeCases = await prismaRead.case.findMany({
      where: {
        status: { notIn: [CaseStatus.RESOLVED, CaseStatus.CLOSED] },
        slaDueAt: { not: null },
      },
      select: { id: true, slaDueAt: true, createdAt: true, status: true },
    });

    const now = Date.now();
    return activeCases.map((c) => {
      const total = c.slaDueAt!.getTime() - c.createdAt.getTime();
      const elapsed = now - c.createdAt.getTime();
      let pctRemaining = 100;
      if (total > 0) {
        pctRemaining = Math.max(0, 100 - (elapsed / total) * 100);
      }
      return {
        caseId: c.id,
        status: c.status,
        pctRemaining,
        slaDueAt: c.slaDueAt,
      };
    });
  }
}

export const supervisorService = new SupervisorService();
