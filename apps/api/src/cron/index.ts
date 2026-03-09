import { Queue } from 'bullmq';
import { logger } from '../lib/logger.js';

const connection = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
};

const cronQueue = new Queue('cron', { connection });

/**
 * Initializes repeatable cron jobs for the CCMP platform.
 */
export async function setupCronJobs() {
  try {
    // 1. Daily Summary Briefing - 6am every day
    await cronQueue.add(
      'daily_summary',
      {},
      {
        repeat: {
          pattern: '0 6 * * *',
        },
        removeOnComplete: true,
      }
    );

    logger.info('Cron jobs initialized: Daily Summary (0 6 * * *)');
  } catch (error) {
    logger.error({ error }, 'Failed to initialize cron jobs');
  }
}
