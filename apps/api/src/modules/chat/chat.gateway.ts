import { Server as SocketIOServer, Socket } from 'socket.io';
import { z } from 'zod';
import { prismaWrite, CaseStatus, CaseChannel } from '@ccmp/database';
import { logger } from '../../lib/logger.js';
import { createClient } from 'redis';

const pubClient = createClient({ url: process.env.REDIS_URL });
pubClient.connect().catch(logger.error);

interface ChatUser {
  id: string;
  email: string;
  role: string;
  firstName?: string;
  lastName?: string;
}

const chatStartSchema = z.object({
  customerEmail: z.string().email(),
  subject: z.string().min(1),
  description: z.string().optional(),
});

const chatMessageSchema = z.object({
  caseId: z.string(),
  content: z.string().min(1),
});

export function registerChatGateway(io: SocketIOServer) {
  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as ChatUser | undefined;

    socket.on('chat:start', async (payload, callback) => {
      try {
        const data = chatStartSchema.parse(payload);
        
        // Agent starting a chat on behalf of customer, or future customer portal
        const newCase = await prismaWrite.case.create({
          data: {
            caseNumber: `CHT-${Date.now()}`,
            subject: data.subject,
            description: data.description,
            customerEmail: data.customerEmail,
            channel: CaseChannel.CHAT,
            status: CaseStatus.NEW,
          },
        });

        // Add creator automatically to the room
        socket.join(`chat:${newCase.id}`);

        await prismaWrite.caseEvent.create({
          data: {
            caseId: newCase.id,
            eventType: 'CHAT_STARTED',
            actorId: user?.id,
          },
        });

        // Notify queue of new case
        await pubClient.publish('case:new', JSON.stringify(newCase));

        if (typeof callback === 'function') {
          callback({ success: true, caseId: newCase.id });
        }
      } catch (err: any) {
        logger.error({ err }, 'chat:start failed');
        if (typeof callback === 'function') callback({ error: err.message });
      }
    });

    socket.on('chat:message', async (payload, callback) => {
      try {
        const { caseId, content } = chatMessageSchema.parse(payload);
        if (!user) throw new Error('Unauthenticated user cannot send messages');

        const note = await prismaWrite.caseNote.create({
          data: {
            caseId,
            content,
            authorId: user.id,
            isInternal: false,
          },
        });

        // Fan-out to room
        io.to(`chat:${caseId}`).emit('chat:message', {
          id: note.id,
          caseId,
          content,
          authorId: user.id,
          authorName: `${user.firstName} ${user.lastName}`.trim() || user.email,
          createdAt: note.createdAt.toISOString()
        });

        if (typeof callback === 'function') callback({ success: true, noteId: note.id });
      } catch (err: any) {
        logger.error({ err }, 'chat:message failed');
        if (typeof callback === 'function') callback({ error: err.message });
      }
    });

    socket.on('chat:end', async ({ caseId }, callback) => {
      try {
        const activeCase = await prismaWrite.case.findUnique({ where: { id: caseId } });
        if (!activeCase) throw new Error('Case not found');

        await prismaWrite.case.update({
          where: { id: caseId },
          data: { status: CaseStatus.RESOLVED },
        });

        await prismaWrite.caseEvent.create({
          data: {
            caseId,
            eventType: 'CHAT_ENDED',
            actorId: user?.id,
          },
        });

        io.to(`chat:${caseId}`).emit('chat:ended', { caseId });
        socket.leave(`chat:${caseId}`);

        // Broadcast to main event hub
        await pubClient.publish('case:status_changed', JSON.stringify({
          caseId,
          status: CaseStatus.RESOLVED,
          actorId: user?.id
        }));

        if (typeof callback === 'function') callback({ success: true });
      } catch (err: any) {
        logger.error({ err }, 'chat:end failed');
        if (typeof callback === 'function') callback({ error: err.message });
      }
    });

    socket.on('chat:join', ({ caseId }) => {
      socket.join(`chat:${caseId}`);
    });

    socket.on('chat:leave', ({ caseId }) => {
      socket.leave(`chat:${caseId}`);
    });
  });
}
