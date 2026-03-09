import { prismaWrite } from '@ccmp/database';
import { slaQueue } from '@ccmp/shared/src/queues';
import { logger } from '../../lib/logger.js';
import { CaseStatus } from '@ccmp/database';

export class SlaService {
  /**
   * Attaches an SLA policy to a case and schedules warning/breach background jobs.
   */
  async attachSlaToCase(caseId: string, slaPolicyId: string, createdAt: Date): Promise<void> {
    try {
      const policy = await prismaWrite.slaPolicy.findUnique({ where: { id: slaPolicyId } });
      if (!policy) {
        logger.warn(`SLA Policy ${slaPolicyId} not found for case ${caseId}`);
        return;
      }

      // Calculate absolute due dates
      const resolutionMs = policy.resolutionTimeMinutes * 60 * 1000;
      const warningMs = resolutionMs * policy.warningThresholdPct;
      
      const dueAt = new Date(createdAt.getTime() + resolutionMs);

      // Update Case with SLA boundaries
      await prismaWrite.case.update({
        where: { id: caseId },
        data: {
          slaPolicyId,
          slaDueAt: dueAt,
        },
      });

      // Schedule background queues
      // Delay = (Target Date - Now)
      const now = Date.now();
      const warningDelay = Math.max(0, (createdAt.getTime() + warningMs) - now);
      const breachDelay = Math.max(0, dueAt.getTime() - now);

      await this.scheduleWarning(caseId, warningDelay);
      await this.scheduleBreach(caseId, breachDelay);

      logger.info(`SLA Attached for ${caseId} (due: ${dueAt.toISOString()})`);
    } catch (err: any) {
      logger.error({ err }, `Failed to attach SLA for ${caseId}`);
      throw err;
    }
  }

  /**
   * Schedules an SLA warning trigger.
   */
  async scheduleWarning(caseId: string, delayMs: number): Promise<void> {
    const jobId = `sla_warning:${caseId}`;
    await slaQueue.add('sla_warning', { caseId, type: 'warning' }, {
      jobId,
      delay: delayMs,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 }
    });
    logger.debug(`Scheduled SLA warning for case ${caseId} in ${Math.round(delayMs/1000)}s`);
  }

  /**
   * Schedules an SLA breach escalation.
   */
  async scheduleBreach(caseId: string, delayMs: number): Promise<void> {
    const jobId = `sla_breach:${caseId}`;
    await slaQueue.add('sla_breach', { caseId, type: 'breach' }, {
      jobId,
      delay: delayMs,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 }
    });
    logger.debug(`Scheduled SLA breach for case ${caseId} in ${Math.round(delayMs/1000)}s`);
  }

  /**
   * Overrides breach scheduling to a strict date timestamp.
   */
  async scheduleBreachAt(caseId: string, targetDate: Date): Promise<void> {
    const delayMs = Math.max(0, targetDate.getTime() - Date.now());
    await this.scheduleBreach(caseId, delayMs);
  }

  /**
   * Gracefully revokes all pending queues when a case is addressed/closed early.
   */
  async cancelSlaJobs(caseId: string): Promise<void> {
    try {
      const warningJob = await slaQueue.getJob(`sla_warning:${caseId}`);
      if (warningJob && await warningJob.isActive() === false) {
        await warningJob.remove();
      }

      const breachJob = await slaQueue.getJob(`sla_breach:${caseId}`);
      if (breachJob && await breachJob.isActive() === false) {
        await breachJob.remove();
      }
      logger.debug(`Cancelled pending SLA jobs for case ${caseId}`);
    } catch (err: any) {
      logger.warn({ err }, `Failed to cleanly cancel SLA jobs for ${caseId}`);
    }
  }
}

export const slaService = new SlaService();
