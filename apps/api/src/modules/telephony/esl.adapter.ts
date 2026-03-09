import modesl from 'modesl';
import { logger } from '../../lib/logger.js';
import { createClient } from 'redis';
import { telephonyQueue } from '@ccmp/shared/src/queues';
import { prismaWrite } from '@ccmp/database';
import { Queue } from 'bullmq';

export class EslAdapter {
  private conn: any = null;
  private attempt = 0;
  private readonly backoffs = [1000, 2000, 4000, 8000, 16000, 30000];
  private redisClient: ReturnType<typeof createClient>;

  constructor() {
    this.redisClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
    this.redisClient.connect().catch((err: any) =>
      logger.error({ err }, 'Redis connection failed in EslAdapter'),
    );
  }

  public connect(): Promise<void> {
    return new Promise((resolve) => {
      const password = process.env.FREESWITCH_ESL_PASSWORD || 'ClueCon';
      logger.info('Connecting to FreeSWITCH Inbound ESL...');

      this.conn = new modesl.Connection('127.0.0.1', 8021, password, () => {
        logger.info('ESL connected');
        this.attempt = 0;
        this.subscribeToEvents();
        resolve();
      });

      this.conn.on('error', (err: any) => {
        logger.error({ err }, 'ESL connection error');
        this.scheduleReconnect();
      });
    });
  }

  private scheduleReconnect(): void {
    const delay = this.backoffs[Math.min(this.attempt, this.backoffs.length - 1)];
    this.attempt++;
    logger.info(`Reconnecting ESL in ${delay}ms (attempt ${this.attempt})...`);
    setTimeout(() => this.connect().catch(() => {}), delay);
  }

  private subscribeToEvents(): void {
    if (!this.conn) return;
    this.conn.events('json', 'CHANNEL_ANSWER CHANNEL_HANGUP_COMPLETE RECORD_STOP');

    this.conn.on('esl::event::CHANNEL_ANSWER::*', async (event: any) => {
      await this.onCallAnswered(event).catch((err: any) =>
        logger.error({ err }, 'onCallAnswered error'),
      );
    });

    this.conn.on('esl::event::CHANNEL_HANGUP_COMPLETE::*', async (event: any) => {
      await this.onCallEnded(event).catch((err: any) =>
        logger.error({ err }, 'onCallEnded error'),
      );
    });

    this.conn.on('esl::event::RECORD_STOP::*', async (event: any) => {
      await this.onRecordingStop(event).catch((err: any) =>
        logger.error({ err }, 'onRecordingStop error'),
      );
    });
  }

  public async onCallAnswered(event: any): Promise<void> {
    const uuid: string | undefined =
      event.getHeader('Caller-Unique-ID') || event.getHeader('Unique-ID');
    if (!uuid) return;

    logger.info({ uuid }, 'CHANNEL_ANSWER received');

    // Create PHONE case via BullMQ job — not inline, to prevent blocking ESL event loop
    await telephonyQueue.add(
      'create_phone_case',
      { uuid },
      { jobId: `telephony_answer_${uuid}`, removeOnComplete: { count: 100 } },
    );

    // Store call state in Redis hash — caseId/agentId will be filled by the worker
    await this.redisClient.hSet(`ccmp:call:${uuid}`, {
      caseId: '',
      agentId: '',
      status: 'answered',
      startedAt: new Date().toISOString(),
    });
  }

  public async onCallEnded(event: any): Promise<void> {
    const uuid: string | undefined =
      event.getHeader('Caller-Unique-ID') || event.getHeader('Unique-ID');
    if (!uuid) return;

    const duration = parseInt(event.getHeader('variable_billsec') || '0', 10);
    logger.info({ uuid, duration }, 'CHANNEL_HANGUP_COMPLETE received');

    // Fetch CDR state and record call_ended event
    const callData = await this.redisClient.hGetAll(`ccmp:call:${uuid}`);
    if (callData?.caseId) {
      await prismaWrite.caseEvent.create({
        data: {
          caseId: callData.caseId,
          eventType: 'telephony.call_ended',
          payload: { duration, uuid },
        },
      });
    }

    await this.redisClient.del(`ccmp:call:${uuid}`);
  }

  public async pauseRecording(callUuid: string, actorId: string): Promise<void> {
    if (!this.conn) throw new Error('ESL not connected');
    this.conn.bgapi(`uuid_record ${callUuid} pause`);
    // Always create AuditLog — even for AGENT role
    await prismaWrite.auditLog.create({
      data: {
        action: 'recording_paused',
        resourceType: 'TELEPHONY',
        resourceId: callUuid,
        actorId,
        payload: { callUuid },
      },
    });
  }

  public async resumeRecording(callUuid: string, actorId: string): Promise<void> {
    if (!this.conn) throw new Error('ESL not connected');
    this.conn.bgapi(`uuid_record ${callUuid} resume`);
    // Always create AuditLog — even for AGENT role
    await prismaWrite.auditLog.create({
      data: {
        action: 'recording_resumed',
        resourceType: 'TELEPHONY',
        resourceId: callUuid,
        actorId,
        payload: { callUuid },
      },
    });
  }

  public async onRecordingStop(event: any): Promise<void> {
    const uuid: string | undefined =
      event.getHeader('Caller-Unique-ID') || event.getHeader('Unique-ID');
    const recordingPath: string | undefined = event.getHeader('Record-File-Path');
    if (!uuid || !recordingPath) return;

    logger.info({ uuid, recordingPath }, 'RECORD_STOP received');

    // Fetch caseId from Redis (filled by the telephony worker after case creation)
    const callData = await this.redisClient.hGetAll(`ccmp:call:${uuid}`);
    const caseId = callData?.caseId;
    if (!caseId) {
      logger.warn({ uuid }, 'RECORD_STOP: no caseId in Redis — skipping ingest');
      return;
    }

    // Dispatch ingest job via BullMQ — never inline to keep ESL event loop fast
    const ingestQueue = new Queue('ingest-recording', {
      connection: { url: process.env.REDIS_URL || 'redis://localhost:6379' },
    });
    await ingestQueue.add(
      'ingest-recording',
      { callUuid: uuid, caseId, localPath: recordingPath },
      { jobId: `ingest_${uuid}`, removeOnComplete: { count: 100 } },
    );
    logger.info({ uuid, caseId }, 'ingest-recording job dispatched');
  }
}

