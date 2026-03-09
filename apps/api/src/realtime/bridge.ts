import { Server as SocketIOServer } from 'socket.io';
import { createClient } from 'redis';
import { logger } from '../lib/logger.js';

const CHANNELS = [
  'case:new',
  'case:assigned',
  'case:status_changed',
  'case:reassigned',
  'sla:warning',
  'sla:breached',
  'queue:backlog'
];

export async function startRealtimeBridge(io: SocketIOServer): Promise<void> {
  // Dedicated subscriber client — separate from BullMQ and pub clients
  const subscriber = createClient({ url: process.env.REDIS_URL });
  await subscriber.connect();

  await subscriber.subscribe(CHANNELS, (message, channel) => {
    try {
      const payload = JSON.parse(message);
      switch (channel) {
        case 'case:assigned':
          // Start SLA monitoring immediately upon assignment 
          import('../modules/sla/sla.service.js').then(({ slaService }) => {
            if (payload.caseId && payload.slaPolicyId && payload.createdAt) {
              slaService.attachSlaToCase(payload.caseId, payload.slaPolicyId, new Date(payload.createdAt)).catch(
                (e: any) => logger.error({ err: e, caseId: payload.caseId }, 'SLA Attachment failed on assignment broadcast')
              );
            }
          }).catch((e: any) => logger.error({ err: e }, 'Failed to lazy load SLA service'));
          
          // Notify specific agent
          io.to(`agent:${payload.agentId}`).emit('case:assigned', payload);
          break;
        case 'case:status_changed':
          // Notify everyone watching this case
          io.to(`case:${payload.caseId}`).emit('case:status_changed', payload);
          break;
        case 'case:reassigned':
          io.to(`agent:${payload.oldAgentId}`).emit('case:removed', payload);
          io.to(`agent:${payload.newAgentId}`).emit('case:assigned', payload);
          break;
        case 'sla:warning':
          io.to(`case:${payload.caseId}`).emit('sla:warning', payload);
          break;
        case 'sla:breached':
          io.to(`case:${payload.caseId}`).emit('sla:breached', payload);
          io.to('supervisors').emit('sla:breached', payload);
          break;
        case 'queue:backlog':
          io.to('supervisors').emit('queue:backlog', payload);
          break;
        default:
          io.emit(channel, payload);
      }
    } catch (err) {
      logger.error({ err, channel, message }, 'Bridge message parse error');
    }
  });

  logger.info('Real-time bridge started');
}
