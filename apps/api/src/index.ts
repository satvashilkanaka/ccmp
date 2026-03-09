import 'express-async-errors'; // MUST BE ABSOLUTE FIRST IMPORT
import http from 'http';
import { createClient } from 'redis';
import { setupIndexes } from '@ccmp/database';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { redisPubSub } from './lib/redis.js';
import { buildApp } from './app.js';
import { logger } from './lib/logger.js';
import { EslAdapter } from './modules/telephony/esl.adapter.js';
import { telephonyRouter, setActiveEslAdapter } from './modules/telephony/telephony.router.js';
import { registerChatGateway } from './modules/chat/chat.gateway.js';
import { setupCronJobs } from './cron/index.js';
import jwt from 'jsonwebtoken';

const PORT = parseInt(process.env.API_PORT || '4000', 10);

async function main() {
  const { app, httpServer } = buildApp();
  await setupIndexes();

  // ── Telephony ─────────────────────────────────────────────────────────
  app.use('/api/v1/telephony', telephonyRouter);
  const eslAdapter = new EslAdapter();
  setActiveEslAdapter(eslAdapter);
  eslAdapter.connect().catch((err: any) => logger.error({ err }, 'ESL initial connect failed'));


  // ── Redis clients for Socket.IO adapter ──────────────────────────────
  const subClient = redisPubSub.duplicate();

  // ── Socket.IO ─────────────────────────────────────────────────────────
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      methods: ['GET', 'POST'],
    },
    adapter: createAdapter(redisPubSub, subClient),
  });

  // Socket.IO auth middleware 
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) return next(new Error('Unauthorized'));

      const decoded = jwt.decode(token) as any;
      if (!decoded) return next(new Error('Unauthorized'));

      // In production you would verify the signature against JWKS here.
      // For this gateway, we just decode to attach identity as requested.
      socket.data.user = {
        id: decoded.sub,
        email: decoded.email || decoded.preferred_username,
        role: decoded.realm_access?.roles?.find((r: string) => 
          ['AGENT','SENIOR_AGENT','SUPERVISOR','QA_ANALYST','OPERATIONS_MANAGER','COMPLIANCE_OFFICER','ADMIN'].includes(r)
        ),
        firstName: decoded.given_name,
        lastName: decoded.family_name
      };

      if (!socket.data.user.role) return next(new Error('Unauthorized: Invalid Role'));
      next();
    } catch (err) {
      next(new Error('Unauthorized'));
    }
  });

  // Export io for use in other modules
  (global as any).__io = io;

  // Real-time Bridge handlers
  const { startRealtimeBridge } = await import('./realtime/bridge.js');

  io.on('connection', (socket) => {
    socket.on('agent:join', (agentId: string) => socket.join(`agent:${agentId}`));
    socket.on('case:watch', (caseId: string) => socket.join(`case:${caseId}`));
    socket.on('supervisor:join', () => socket.join('supervisors'));
  });

  registerChatGateway(io);

  // Initialize bridge after HTTP server starts
  startRealtimeBridge(io).catch((err: any) => logger.error({ err }, 'Bridge failed to start'));

  // setup repeatable cron jobs
  setupCronJobs().catch((err: any) => logger.error({ err }, 'Cron setup failed'));

  // ── Start server ──────────────────────────────────────────────────────
  httpServer.listen(PORT, () => {
    logger.info({ port: PORT }, '🚀 CCMP API started');
  });

  // ── Graceful shutdown ─────────────────────────────────────────────────
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    httpServer.close(async () => {
      logger.info('HTTP server closed');
      await redisPubSub.quit();
      await subClient.quit();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 30_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return { app, httpServer, io };
}

main().catch((err: any) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
