import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import CircuitBreaker from 'opossum';
import { unlink } from 'fs/promises';
import { createReadStream, statSync } from 'fs';
import { prismaWrite } from '@ccmp/database';
import { logger } from '../../lib/logger.js';
import { ForbiddenError, NotFoundError } from '../../lib/errors.js';

const BUCKET = process.env.MINIO_RECORDINGS_BUCKET || 'ccmp-recordings';
const PRESIGNED_TTL_SECONDS = 900; // 15 minutes — exactly, no more

const PLAYBACK_ROLES = ['QA_ANALYST', 'SUPERVISOR', 'ADMIN'] as const;
type PlaybackRole = (typeof PLAYBACK_ROLES)[number];

// ── S3 client (MinIO-compatible) ───────────────────────────────────────────
const s3 = new S3Client({
  endpoint: `http://${process.env.MINIO_ENDPOINT || 'localhost'}:${process.env.MINIO_PORT || '9000'}`,
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.MINIO_ROOT_USER || 'ccmp_admin',
    secretAccessKey: process.env.MINIO_ROOT_PASSWORD || 'minio_password123',
  },
  forcePathStyle: true,
});

// ── Circuit Breaker for MinIO ──────────────────────────────────────────────
// Open after 50% errors, reset after 30s.
const minioBreaker = new CircuitBreaker(
  async (fn: () => Promise<any>) => fn(),
  {
    errorThresholdPercentage: 50,
    resetTimeout: 30_000,
    timeout: 10_000,
    volumeThreshold: 5,
  },
);

minioBreaker.on('open', () => logger.warn('MinIO circuit breaker OPEN — failing fast'));
minioBreaker.on('close', () => logger.info('MinIO circuit breaker CLOSED — requests resuming'));

function fireMinIO<T>(fn: () => Promise<T>): Promise<T> {
  return minioBreaker.fire(fn) as Promise<T>;
}

// ── RecordingService ───────────────────────────────────────────────────────
export class RecordingService {
  /**
   * Uploads recording from local path to MinIO with AES-256 SSE,
   * creates DB Recording row, then deletes the local temp file.
   */
  async ingestRecording(
    callUuid: string,
    caseId: string,
    localPath: string,
  ): Promise<void> {
    const storageKey = `recordings/${caseId}/${callUuid}.wav`;

    let fileSizeBytes: number;
    try {
      fileSizeBytes = statSync(localPath).size;
    } catch (err) {
      logger.error({ err, localPath }, 'Recording file not found — skipping ingest');
      return;
    }

    // Upload to MinIO via circuit breaker with AES-256 SSE
    await fireMinIO(async () => {
      const stream = createReadStream(localPath);
      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: storageKey,
          Body: stream,
          ContentType: 'audio/wav',
          ServerSideEncryption: 'AES256',
        }),
      );
    });

    logger.info({ callUuid, caseId, storageKey }, 'Recording uploaded to MinIO');

    // Create DB Recording row
    await prismaWrite.recording.create({
      data: {
        caseId,
        callUuid,
        filename: `${callUuid}.wav`,
        storageKey,
        fileSizeBytes,
        encryptionAlgorithm: 'AES256',
        retentionExpiresAt: new Date(
          Date.now() + parseInt(process.env.RECORDING_RETENTION_DAYS || '90', 10) * 86_400_000,
        ),
      },
    });

    // Delete local temp file
    try {
      await unlink(localPath);
      logger.debug({ localPath }, 'Deleted local recording temp file');
    } catch (err) {
      logger.warn({ err, localPath }, 'Failed to delete local recording temp file');
    }
  }

  /**
   * Generates a 15-minute presigned playback URL.
   * Throws ForbiddenError BEFORE generating URL for unauthorized roles.
   * Always creates AuditLog on success.
   */
  async generatePlaybackUrl(
    recordingId: string,
    requestorId: string,
    requestorRole: string,
  ): Promise<string> {
    // 1. Role check FIRST — never generate URL for unauthorized access
    if (!PLAYBACK_ROLES.includes(requestorRole as PlaybackRole)) {
      throw new ForbiddenError(
        'Only QA Analysts, Supervisors, and Admins can play back recordings',
      );
    }

    // 2. Fetch recording
    const recording = await prismaWrite.recording.findUnique({
      where: { id: recordingId },
    });
    if (!recording) throw new NotFoundError(`Recording ${recordingId} not found`);

    // 3. Generate presigned URL (TTL = exactly 900s)
    const url = await fireMinIO(() =>
      getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: BUCKET, Key: recording.storageKey }),
        { expiresIn: PRESIGNED_TTL_SECONDS },
      ),
    );

    // 4. Create AuditLog — wrap in try/catch but re-throw only if DB is completely down
    try {
      await prismaWrite.auditLog.create({
        data: {
          action: 'played',
          resourceType: 'RECORDING',
          resourceId: recordingId,
          actorId: requestorId,
          payload: { recordingId, caseId: recording.caseId, role: requestorRole },
        },
      });
    } catch (err: any) {
      // Only re-throw if DB is completely unreachable
      if (err?.code === 'P1001' || err?.message?.includes('connect')) {
        throw err;
      }
      logger.error({ err, recordingId }, 'AuditLog write failed for recording playback');
    }

    return url;
  }

  /**
   * Deletes a recording from MinIO and DB (used by retention processor).
   */
  async deleteRecording(recordingId: string, storageKey: string): Promise<void> {
    await fireMinIO(() =>
      s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: storageKey })),
    );
    await prismaWrite.recording.delete({ where: { id: recordingId } });
    // Note: AuditLog rows are kept permanently — never deleted
    logger.info({ recordingId, storageKey }, 'Recording deleted (retention)');
  }
}

export const recordingService = new RecordingService();
