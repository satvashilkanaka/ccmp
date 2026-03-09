import './env.js';


import { maintenanceQueue } from '@ccmp/shared/src/queues';
import { slaWorker } from './processors/sla.processor.js';
import {
  recordingIngestWorker,
} from './processors/recording-retention.processor.js';
import { caseAgingWorker } from './processors/case-aging.processor.js';
import { csatWorker } from './processors/csat.processor.js';
import { cronWorker } from './processors/cron.processor.js';
import { Queue, QueueEvents } from 'bullmq';

const connection = { url: process.env.REDIS_URL || 'redis://localhost:6379' };

async function bootstrap() {
  console.log('🚀 Background Workers Starting...');

  // SLA worker
  slaWorker.on('ready', () => console.log('✅ SLA Worker Active'));
  slaWorker.on('error', (err: Error) => console.error('❌ SLA Worker Error:', err));

  // SLA Burst Handling & Monitoring
  const slaQueueEvents = new QueueEvents('sla', { connection });
  slaQueueEvents.on('active', ({ jobId }) => {
    // Only log sporadically or specifically for burst analysis
  });
  
  const slaQueue = new Queue('sla', { connection });
  setInterval(async () => {
    try {
      const counts = await slaQueue.getJobCounts('waiting', 'active');
      const depth = counts.waiting + counts.active;
      
      const currentConcurrency = (slaWorker as any).concurrency || 1;
      
      if (depth > 1000 && currentConcurrency !== 50) {
        console.warn(`⚠️ [BURST] SLA Queue Depth (${depth}) exceeded 1000. Scaling concurrency to 50.`);
        slaWorker.concurrency = 50;
      } else if (depth <= 1000 && currentConcurrency !== 10) {
        // Fall back to a default concurrency (e.g., 10)
        slaWorker.concurrency = 10;
        if (currentConcurrency === 50) {
           console.log(`📉 [NORMALIZE] SLA Queue Depth (${depth}) back to normal. Scaling concurrency down to 10.`);
        }
      }
    } catch (err) {
      console.error('Failed to probe SLA queue depth', err);
    }
  }, 5000);

  // CSAT worker
  csatWorker.on('ready', () => console.log('✅ CSAT Worker Active'));
  csatWorker.on('error', (err: Error) => console.error('❌ CSAT Worker Error:', err));

  // Recording ingest worker
  recordingIngestWorker.on('ready', () => console.log('✅ Recording Ingest Worker Active'));
  recordingIngestWorker.on('error', (err: Error) =>
    console.error('❌ Recording Ingest Worker Error:', err),
  );

  // Daily maintenance cron (midnight)
  await maintenanceQueue.add('daily_cleanup', {}, {
    repeat: { pattern: '0 0 * * *' },
    jobId: 'daily_cleanup_cron',
  });

  // Daily recording retention cron (1am)
  await maintenanceQueue.add('recording_retention', {}, {
    repeat: { pattern: '0 1 * * *' },
    jobId: 'recording_retention_cron',
  });

  // 4h Case Aging cron
  const caseAgingQueue = new Queue('case-aging', { connection });
  await caseAgingQueue.add('case_aging_sweep', {}, {
    repeat: { pattern: '0 */4 * * *' },
    jobId: 'case_aging_cron',
  });

  caseAgingWorker.on('ready', () => console.log('✅ Case Aging Worker Active'));
  caseAgingWorker.on('error', (err: Error) => console.error('❌ Case Aging Worker Error:', err));

  // Cron worker
  cronWorker.on('ready', () => console.log('✅ Cron Worker Active'));
  cronWorker.on('error', (err: Error) => console.error('❌ Cron Worker Error:', err));

  console.log('📅 Maintenance, Retention & Aging Crons Added');
}

bootstrap().catch(console.error);

process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down workers gracefully...');
  await slaWorker.close();
  await recordingIngestWorker.close();
  await caseAgingWorker.close();
  await csatWorker.close();
  await cronWorker.close();
  process.exit(0);
});
