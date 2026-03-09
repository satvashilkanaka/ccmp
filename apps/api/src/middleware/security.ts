import { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redisCache } from '../lib/redis.js';

export function applySecurityMiddleware(app: Application) {
  // 1. Helmet for secure headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", "wss:", "ws:"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        imgSrc: ["'self'", "data:", "blob:"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
      },
    },
    hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
    frameguard: { action: 'deny' }, // Clickjacking protection
  }));

  // 2. CORS configuration
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || [],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Idempotency-Key'],
    maxAge: 86400,
    credentials: true,
  }));

  // 3. Global Rate Limiter: 200 req/min
  const globalLimiter = rateLimit({
    windowMs: 60_000,
    limit: 200,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    store: new RedisStore({
      // @ts-ignore - ioredis sendCommand compatibility
      sendCommand: (...args: string[]) => redisCache.call(...args),
    }),
    handler: (req, res) => {
      res.status(429).json({ error: 'Too many requests, please try again later.' });
    },
  });
  app.use(globalLimiter);

  // 4. Auth-specific Limiter: 10 req/min
  const authLimiter = rateLimit({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    store: new RedisStore({
      // @ts-ignore - ioredis sendCommand compatibility
      sendCommand: (...args: string[]) => redisCache.call(...args),
      prefix: 'rl:auth:',
    }),
    handler: (req, res) => {
      res.status(429).json({ error: 'Too many authentication attempts, please wait a minute.' });
    },
  });
  app.use('/api/v1/auth', authLimiter);
}
