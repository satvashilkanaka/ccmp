import { Queue, QueueOptions } from 'bullmq';

const connection = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
};

const defaultJobOptions = {
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
};

const queueConfig: QueueOptions = {
  connection,
  defaultJobOptions,
};

// Queues referenced across the monorepo
export const slaQueue = new Queue('sla', queueConfig);
export const dlqQueue = new Queue('sla-dlq', queueConfig);
export const csatQueue = new Queue('csat', queueConfig);
export const maintenanceQueue = new Queue('maintenance', queueConfig);
export const telephonyQueue = new Queue('telephony', queueConfig);

