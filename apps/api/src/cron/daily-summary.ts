import { prismaRead, UserRole } from '@ccmp/database';
import { render } from '@react-email/render';
import { sendEmail } from '../lib/email.js';
// @ts-ignore
import { DailySummary } from '../templates/DailySummary.js'
import { logger } from '../lib/logger.js';

/**
 * Aggregates yesterday's performance metrics and sends a daily summary email
 * to all supervisors who have opted in.
 */
export async function processDailySummary() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  const endOfYesterday = new Date(yesterday);
  endOfYesterday.setHours(23, 59, 59, 999);

  // 1. Aggregate Metrics
  const [totalCases, unassignedCount, resolvedCases] = await Promise.all([
    prismaRead.case.count({
      where: { createdAt: { gte: yesterday, lte: endOfYesterday } }
    }),
    prismaRead.case.count({
      where: { assignedToId: null, createdAt: { gte: yesterday, lte: endOfYesterday } }
    }),
    prismaRead.case.findMany({
      where: { status: 'RESOLVED', updatedAt: { gte: yesterday, lte: endOfYesterday } },
      select: { createdAt: true, updatedAt: true }
    })
  ]);

  // SLA Calculation (Mock logic for brevity)
  const slaBreachCount = await prismaRead.case.count({
    where: { slaBreachedAt: { gte: yesterday, lte: endOfYesterday } }
  });
  const slaBreachRate = totalCases > 0 ? (slaBreachCount / totalCases) * 100 : 0;

  // Avg Resolution Time
  let avgResolutionTime = 'N/A';
  if (resolvedCases.length > 0) {
    const totalMs = resolvedCases.reduce((acc, c) => acc + (c.updatedAt.getTime() - c.createdAt.getTime()), 0);
    const avgMs = totalMs / resolvedCases.length;
    avgResolutionTime = `${(avgMs / 3600000).toFixed(1)} hours`;
  }

  // 2. Fetch Supervisors
  const supervisors = await prismaRead.user.findMany({
    where: { role: UserRole.SUPERVISOR, isActive: true },
    include: { notificationPreference: true }
  });

  // 3. Send Emails
  for (const supervisor of supervisors) {
    if (supervisor.email && supervisor.notificationPreference?.emailDailySummary !== false) {
      try {
        const html = await (render as any)(DailySummary({
          supervisorName: supervisor.firstName,
          date: yesterday.toLocaleDateString(),
          totalCases,
          avgResolutionTime,
          slaBreachRate: Number(slaBreachRate.toFixed(1)),
          unassignedCount
        }) as any);

        await sendEmail(supervisor.email, `Daily System Summary: ${yesterday.toLocaleDateString()}`, html);
      } catch (error) {
        logger.error({ error, userId: supervisor.id }, 'Failed to send daily summary email');
      }
    }
  }

  return { processedCount: supervisors.length };
}
