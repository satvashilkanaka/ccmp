import { Worker, Job } from 'bullmq';
import { prismaWrite, prismaRead, CaseStatus } from '@ccmp/database';

const connection = { url: process.env.REDIS_URL || 'redis://localhost:6379' };

/**
 * 4h Cron Job to find WAITING_ON_CUSTOMER cases older than 24h and escalate them.
 */
export const caseAgingWorker = new Worker(
  'case-aging',
  async (job: Job) => {
    console.log(`[Case Aging Worker] Starting stale cases sweep...`);

    const STALE_HOURS = 24;
    const thresholdDate = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000);

    const staleCases = await prismaRead.case.findMany({
      where: {
        status: CaseStatus.WAITING_ON_CUSTOMER,
        updatedAt: { lt: thresholdDate },
        deletedAt: null,
      },
      select: { id: true, version: true },
    });

    if (staleCases.length === 0) {
      console.log(`[Case Aging Worker] No stale cases found.`);
      return { success: true, processed: 0 };
    }

    let processedCount = 0;

    for (const c of staleCases) {
      try {
        await prismaWrite.$transaction(async (tx) => {
          const result = await tx.case.updateMany({
            where: { id: c.id, version: c.version },
            data: {
              status: CaseStatus.ESCALATED,
              version: { increment: 1 },
            },
          });

          if (result.count > 0) {
            await tx.caseEvent.create({
              data: {
                caseId: c.id,
                eventType: 'AUTO_ESCALATED',
                actorId: 'system',
                payload: { reason: '> 24h without customer response' },
              },
            });

            await tx.auditLog.create({
              data: {
                action: 'CASE_AUTO_ESCALATED',
                resourceType: 'CASE',
                resourceId: c.id,
                actorId: 'system',
                payload: { oldStatus: CaseStatus.WAITING_ON_CUSTOMER },
              },
            });
            processedCount++;
          }
        });
      } catch (err: any) {
        console.error(`[Case Aging Worker] Failed to update case ${c.id}: ${err.message}`);
      }
    }

    console.log(`[Case Aging Worker] Escalated ${processedCount} stale cases.`);
    return { success: true, processed: processedCount };
  },
  {
    connection,
    concurrency: 1,
  }
);

caseAgingWorker.on('error', (err) => {
  console.error(`[Case Aging Worker Error] ${err.message}`);
});
