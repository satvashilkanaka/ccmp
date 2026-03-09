import * as dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });
if (process.env.DATABASE_URL) process.env.DATABASE_URL = process.env.DATABASE_URL.trim();
if (process.env.DATABASE_DIRECT_URL) {
  process.env.DATABASE_DIRECT_URL = process.env.DATABASE_DIRECT_URL.trim();
  process.env.DATABASE_URL = process.env.DATABASE_DIRECT_URL;
}
import { prismaWrite, CaseStatus, CasePriority, CaseChannel } from '@ccmp/database';
import { slaService } from '../src/modules/sla/sla.service';
import { slaQueue } from '@ccmp/shared/src/queues';

async function verify() {
  console.log('Running Verification for SLA...');
  
  // Create Policy
  const policy = await prismaWrite.slaPolicy.create({
    data: {
      name: 'Verification Policy',
      priority: CasePriority.CRITICAL,
      channel: CaseChannel.PHONE,
      responseTimeMinutes: 5,
      resolutionTimeMinutes: 5,
      warningThresholdPct: 0.8
    }
  });
  
  // Create Case
  const c = await prismaWrite.case.create({
    data: {
      caseNumber: `TEST-SLA-${Date.now()}`,
      subject: 'Test SLA',
      status: CaseStatus.NEW,
      priority: CasePriority.CRITICAL,
      channel: CaseChannel.PHONE,
    }
  });
  
  await slaService.attachSlaToCase(c.id, policy.id, new Date());
  
  // Check queue
  const jobs = await slaQueue.getDelayed();
  console.log(`Delayed SLA Jobs: ${jobs.length}`);
  if (jobs.length < 2) throw new Error('Failed to attach Warning & Breach jobs');
  
  // Check Heatmap manually via Prisma
  const cases = await prismaWrite.case.findMany({ where: { id: c.id }, include: { slaPolicy: true } });
  console.log(`Cases on Heatmap: ${cases.length}`);
  if (cases[0].slaDueAt) {
    console.log(`Pass! SLA applied successfully.`);
  }

  console.log('Cleaning up mock data...');
  await slaService.cancelSlaJobs(c.id);
  await prismaWrite.case.delete({ where: { id: c.id } });
  await prismaWrite.slaPolicy.delete({ where: { id: policy.id } });
  console.log('Done.');
}

verify().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
