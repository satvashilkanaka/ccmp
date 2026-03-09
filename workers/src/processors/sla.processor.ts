import { Worker, Job } from 'bullmq';
import { prismaWrite, CaseStatus, UserRole } from '@ccmp/database';
import { dlqQueue } from '@ccmp/shared/src/queues';
import { createClient } from 'redis';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { renderAsync } = require('@react-email/render');
// @ts-ignore - Importing from sibling app
import { sendEmail } from '../../../apps/api/src/lib/email.js';
// @ts-ignore
import { SlaWarning } from '../../../apps/api/src/templates/SlaWarning.js';
// @ts-ignore
import { SlaBreach } from '../../../apps/api/src/templates/SlaBreach.js';

const connection = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
};

const pubClient = createClient({ url: connection.url });
pubClient.connect().catch(console.error);

const ESCALATION_CHAIN: UserRole[] = [UserRole.SENIOR_AGENT, UserRole.SUPERVISOR, UserRole.OPERATIONS_MANAGER];

/**
 * Identify the next valid step in the Escalation Chain.
 */
function getNextEscalationContext(currentRole?: UserRole | null): UserRole {
  if (!currentRole) return UserRole.SUPERVISOR; // Default jump 
  const idx = ESCALATION_CHAIN.indexOf(currentRole);
  if (idx === -1 || idx === ESCALATION_CHAIN.length - 1) {
    return UserRole.OPERATIONS_MANAGER; // Ceiling
  }
  return ESCALATION_CHAIN[idx + 1];
}

export const slaWorker = new Worker(
  'sla',
  async (job: Job) => {
    const { caseId, type } = job.data;
    if (!caseId || !type) throw new Error('Invalid Job Payload');

    // 1. Fetch fresh Case from DB (never trust stale payloads)
    const freshCase = await prismaWrite.case.findUnique({
      where: { id: caseId },
      include: { assignedTo: true },
    });

    if (!freshCase) {
      console.warn(`[SLA] Case ${caseId} not found, skipping.`);
      return;
    }

    // 2. Resolve or Closed cases implicitly halt SLAs
    if (freshCase.status === CaseStatus.RESOLVED || freshCase.status === CaseStatus.CLOSED) {
      console.debug(`[SLA] Case ${caseId} is already ${freshCase.status}, safely skipping job.`);
      return;
    }

    // 3. Process Warning Jobs
    if (type === 'warning') {
      console.info(`[SLA] Firing WARNING for case ${caseId}`);
      await pubClient.publish('sla:warning', JSON.stringify({
        caseId,
        message: 'SLA Warning Threshold Breached',
        timestamp: new Date().toISOString()
      }));

      // 3a. Send Email Warning if opted in
      const agent = await prismaWrite.user.findUnique({
        where: { id: freshCase.assignedToId || '' },
        include: { notificationPreference: true }
      });

      if (agent?.email && agent.notificationPreference?.emailOnSlaWarning !== false) {
        const html = await renderAsync(SlaWarning({ 
          caseId: freshCase.id, 
          agentName: agent.firstName, 
          slaDueAt: freshCase.slaDueAt?.toLocaleTimeString() || 'soon' 
        }) as any);
        
        await sendEmail(agent.email, `SLA Warning: Case ${freshCase.caseNumber}`, html);
      }

      // Record telemetry via AuditLog (no case mutation required for warning)
      await prismaWrite.auditLog.create({
        data: {
          action: 'SLA_WARNING_TRIGGERED',
          resourceType: 'CASE',
          resourceId: caseId,
          payload: { warningTriggeredAt: new Date().toISOString() }
        }
      });
      return;
    }

    // 4. Process Breach Escapation Jobs
    if (type === 'breach') {
      console.info(`[SLA] Firing BREACH escalations for case ${caseId}`);

      await prismaWrite.$transaction(async (tx: any) => {
        const nextRole = getNextEscalationContext(freshCase.assignedTo?.role);
        
        await tx.case.update({
          where: { id: caseId },
          data: {
            status: CaseStatus.ESCALATED,
            slaBreachedAt: new Date()
          }
        });

        await tx.caseEvent.create({
          data: {
            caseId,
            eventType: 'SLA_BREACHED',
            payload: { escalatedRoleTarget: nextRole, breachedAt: new Date().toISOString() }
          }
        });

        await tx.auditLog.create({
          data: {
            action: 'SLA_BREACH_ESCALATED',
            resourceType: 'CASE',
            resourceId: caseId,
            payload: { nextRole }
          }
        });

        if (nextRole === UserRole.OPERATIONS_MANAGER) {
          console.warn(`[SLA] Operations Manager strictly notified for breaching ceiling limits on ${caseId}`);
          // Send specific Ops Manager notify ping (Stubbed logic for implementation)
        }

        // 4a. Send Breach Email to Supervisor
        const supervisor = await prismaWrite.user.findFirst({
          where: { role: UserRole.SUPERVISOR, teamId: freshCase.teamId, isActive: true },
          include: { notificationPreference: true }
        });

        if (supervisor?.email && supervisor.notificationPreference?.emailOnSlaBreach !== false) {
          const html = await renderAsync(SlaBreach({
            caseId: freshCase.id,
            agentName: freshCase.assignedTo?.firstName || 'Assigned Agent',
            supervisorName: supervisor.firstName,
            breachedAt: new Date().toLocaleString()
          }) as any);

          await sendEmail(supervisor.email, `CRITICAL: SLA Breach - ${freshCase.caseNumber}`, html);
        }
      });

      // Synchronize breach globally towards connected agent desktops
      await pubClient.publish('sla:breached', JSON.stringify({
        caseId,
        escalated: true,
        timestamp: new Date().toISOString()
      }));
      return;
    }
    
    throw new Error(`Unknown job classification type: ${type}`);
  },
  {
    connection,
    concurrency: 20,
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  }
);

// DLQ Mappings (3 Attempts maximum -> Push to Dead Letters)
slaWorker.on('failed', async (job: Job | undefined, err: Error) => {
  if (job && job.attemptsMade >= job.opts.attempts!) {
    console.error(`[SLA] Job ${job.id} exhausted. Moving ${job.data.caseId} cleanly to Dead Letter Queues. Error: ${err.message}`);
    await dlqQueue.add('dead_letter_sla', job.data);
  } else {
    console.warn(`[SLA] Job failed gracefully, backing off... ${err.message}`);
  }
});
