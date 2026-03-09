import { Redis } from 'ioredis';
import { logger } from './logger.js';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// 1. General Cache (Session, Presence, RL)
export const redisCache = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
});

// 2. Dedicated BullMQ Connection (Should never overlap with PubSub due to block-list issues)
export const redisBullMQ = new Redis(redisUrl, {
  maxRetriesPerRequest: null, // Critical requirement for BullMQ
});

// 3. Socket.IO Pub/Sub Adapter Connection
export const redisPubSub = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
});

const handleRedisError = (name: string, err: any) => {
  logger.error({ err, name }, `Redis client ${name} disconnected`);
};

redisCache.on('error', (err: any) => handleRedisError('redisCache', err));
redisBullMQ.on('error', (err: any) => handleRedisError('redisBullMQ', err));
redisPubSub.on('error', (err: any) => handleRedisError('redisPubSub', err));
