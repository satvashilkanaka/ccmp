/**
 * Recording Retention Processor — workers/src/processors/recording-retention.processor.ts
 *
 * Responsibilities:
 * 1. recordingIngestWorker — processes 'ingest-recording' BullMQ jobs
 * 2. runRecordingRetention — batch-deletes expired recordings (100 at a time)
 *
 * NOTE: This processor intentionally duplicates the S3/delete logic rather than
 * importing across the api package boundary (which is outside the workers rootDir).
 */
import { Worker, Job } from 'bullmq';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import CircuitBreaker from 'opossum';
import { unlink } from 'fs/promises';
import { createReadStream, statSync } from 'fs';
import { prismaWrite } from '@ccmp/database';

const BUCKET = process.env.MINIO_RECORDINGS_BUCKET || 'ccmp-recordings';
const BATCH_SIZE = 100;
const RETENTION_DAYS = parseInt(process.env.RECORDING_RETENTION_DAYS || '90', 10);
const connection = { url: process.env.REDIS_URL || 'redis://localhost:6379' };

const s3 = new S3Client({
  endpoint: `http://${process.env.MINIO_ENDPOINT || 'localhost'}:${process.env.MINIO_PORT || '9000'}`,
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.MINIO_ROOT_USER || 'ccmp_admin',
    secretAccessKey: process.env.MINIO_ROOT_PASSWORD || 'minio_password123',
  },
  forcePathStyle: true,
});

const minioBreaker = new CircuitBreaker(
  async (fn: () => Promise<any>) => fn(),
  { errorThresholdPercentage: 50, resetTimeout: 30_000, timeout: 10_000, volumeThreshold: 5 },
);

minioBreaker.on('open', () => console.warn('MinIO circuit breaker OPEN'));
minioBreaker.on('close', () => console.info('MinIO circuit breaker CLOSED'));

async function fireMinIO<T>(fn: () => Promise<T>): Promise<T> {
  return minioBreaker.fire(fn) as Promise<T>;
}

// ── Ingest: upload to MinIO + create DB row + delete local file ────────────
async function ingestRecording(callUuid: string, caseId: string, localPath: string) {
  const storageKey = `recordings/${caseId}/${callUuid}.wav`;

  let fileSizeBytes: number;
  try {
    fileSizeBytes = statSync(localPath).size;
  } catch {
    console.error({ localPath }, 'Recording file not found — skipping ingest');
    return;
  }

  await fireMinIO(async () => {
    const stream = createReadStream(localPath);
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: storageKey,
      Body: stream,
      ContentType: 'audio/wav',
      ServerSideEncryption: 'AES256',
    }));
  });

  await prismaWrite.recording.create({
    data: {
      caseId,
      callUuid,
      filename: `${callUuid}.wav`,
      storageKey,
      fileSizeBytes,
      encryptionAlgorithm: 'AES256',
      retentionExpiresAt: new Date(Date.now() + RETENTION_DAYS * 86_400_000),
    },
  });

  try {
    await unlink(localPath);
  } catch (err: any) {
    console.warn({ err, localPath }, 'Failed to delete local recording temp file');
  }

  console.info({ callUuid, caseId, storageKey }, 'Recording ingested');
}

// ── Delete: remove from MinIO + DB (AuditLog rows are kept permanently) ───
async function deleteRecording(recordingId: string, storageKey: string) {
  await fireMinIO(() => s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: storageKey })));
  await prismaWrite.recording.delete({ where: { id: recordingId } });
  console.info({ recordingId, storageKey }, 'Recording deleted (retention)');
}

// ── Recording Ingest Worker ────────────────────────────────────────────────
export const recordingIngestWorker = new Worker(
  'ingest-recording',
  async (job: Job) => {
    const { callUuid, caseId, localPath } = job.data;
    if (!callUuid || !caseId || !localPath) throw new Error('Invalid ingest-recording payload');
    await ingestRecording(callUuid, caseId, localPath);
  },
  { connection, concurrency: 5, removeOnComplete: { count: 100 }, removeOnFail: { count: 500 } },
);

recordingIngestWorker.on('failed', (job: Job | undefined, err: Error) =>
  console.error({ jobId: job?.id, err: err.message }, 'Recording ingest job failed'),
);

// ── Retention Cleanup ──────────────────────────────────────────────────────
export async function runRecordingRetention(): Promise<void> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
  console.info({ cutoff }, 'Starting recording retention cleanup');
  let totalDeleted = 0;
  let page = 0;

  while (true) {
    const batch = await prismaWrite.recording.findMany({
      where: {
        OR: [
          { retentionExpiresAt: { lt: cutoff } },
          { retentionExpiresAt: null, createdAt: { lt: cutoff } },
        ],
      },
      take: BATCH_SIZE,
      skip: page * BATCH_SIZE,
      select: { id: true, storageKey: true },
    });

    if (batch.length === 0) break;
    console.info({ batchSize: batch.length, page }, 'Processing retention batch');

    for (const rec of batch) {
      try {
        await deleteRecording(rec.id, rec.storageKey);
        totalDeleted++;
      } catch (err: any) {
        console.error({ err, recordingId: rec.id }, 'Batch delete failed — continuing');
      }
    }

    if (batch.length < BATCH_SIZE) break;
    page++;
  }

  console.info({ totalDeleted }, 'Recording retention cleanup complete');
}
