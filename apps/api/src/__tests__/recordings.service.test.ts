import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock @ccmp/database ─────────────────────────────────────────────────────
vi.mock('@ccmp/database', () => ({
  prismaWrite: {
    recording: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

// ── Mock @aws-sdk/client-s3 ─────────────────────────────────────────────────
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({}),
  })),
  PutObjectCommand: vi.fn(),
  DeleteObjectCommand: vi.fn(),
  GetObjectCommand: vi.fn(),
}));

// ── Mock @aws-sdk/s3-request-presigner ──────────────────────────────────────
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://minio.local/presigned-url?X-Amz-Expires=900'),
}));

// ── Mock opossum (circuit breaker) ──────────────────────────────────────────
vi.mock('opossum', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      fire: vi.fn((fn: () => Promise<any>) => fn()),
      on: vi.fn(),
    })),
  };
});

// ── Mock fs ─────────────────────────────────────────────────────────────────
vi.mock('fs/promises', () => ({
  unlink: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('fs', () => ({
  statSync: vi.fn().mockReturnValue({ size: 1024 }),
  createReadStream: vi.fn().mockReturnValue('mock-stream'),
}));

// ── Mock pino logger ────────────────────────────────────────────────────────
vi.mock('../../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ── Mock errors ─────────────────────────────────────────────────────────────
vi.mock('../../lib/errors.js', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return actual;
});

import { prismaWrite } from '@ccmp/database';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { RecordingService } from '../../src/modules/recordings/recording.service';
import { ForbiddenError } from '../../src/lib/errors';

describe('RecordingService', () => {
  let service: RecordingService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RecordingService();
  });

  // ─── AGENT → 403 ForbiddenError ─────────────────────────────────────────
  describe('generatePlaybackUrl - Role Gating', () => {
    it('should throw ForbiddenError when AGENT requests playback', async () => {
      await expect(
        service.generatePlaybackUrl('rec-1', 'agent-1', 'AGENT'),
      ).rejects.toThrow(ForbiddenError);

      // Ensure no presigned URL was generated
      expect(getSignedUrl).not.toHaveBeenCalled();
      // Ensure no AuditLog was created
      expect(prismaWrite.auditLog.create).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenError for SENIOR_AGENT', async () => {
      await expect(
        service.generatePlaybackUrl('rec-1', 'agent-2', 'SENIOR_AGENT'),
      ).rejects.toThrow(ForbiddenError);
    });

    it('should allow QA_ANALYST role', async () => {
      vi.mocked(prismaWrite.recording.findUnique).mockResolvedValue({
        id: 'rec-1',
        storageKey: 'recordings/case-1/uuid.wav',
        caseId: 'case-1',
      } as any);

      const url = await service.generatePlaybackUrl('rec-1', 'qa-1', 'QA_ANALYST');
      expect(url).toContain('presigned-url');
    });

    it('should allow SUPERVISOR role', async () => {
      vi.mocked(prismaWrite.recording.findUnique).mockResolvedValue({
        id: 'rec-2',
        storageKey: 'recordings/case-2/uuid.wav',
        caseId: 'case-2',
      } as any);

      const url = await service.generatePlaybackUrl('rec-2', 'sup-1', 'SUPERVISOR');
      expect(url).toContain('presigned-url');
    });

    it('should allow ADMIN role', async () => {
      vi.mocked(prismaWrite.recording.findUnique).mockResolvedValue({
        id: 'rec-3',
        storageKey: 'recordings/case-3/uuid.wav',
        caseId: 'case-3',
      } as any);

      const url = await service.generatePlaybackUrl('rec-3', 'admin-1', 'ADMIN');
      expect(url).toContain('presigned-url');
    });
  });

  // ─── AuditLog on every playback ─────────────────────────────────────────
  describe('generatePlaybackUrl - AuditLog', () => {
    it('should always create an AuditLog entry on successful playback', async () => {
      vi.mocked(prismaWrite.recording.findUnique).mockResolvedValue({
        id: 'rec-audit',
        storageKey: 'recordings/case-x/uuid.wav',
        caseId: 'case-x',
      } as any);

      await service.generatePlaybackUrl('rec-audit', 'qa-1', 'QA_ANALYST');

      expect(prismaWrite.auditLog.create).toHaveBeenCalledWith({
        data: {
          action: 'played',
          resourceType: 'RECORDING',
          resourceId: 'rec-audit',
          actorId: 'qa-1',
          payload: { recordingId: 'rec-audit', caseId: 'case-x', role: 'QA_ANALYST' },
        },
      });
    });

    it('should create AuditLog for SUPERVISOR playback', async () => {
      vi.mocked(prismaWrite.recording.findUnique).mockResolvedValue({
        id: 'rec-sup',
        storageKey: 'recs/sup.wav',
        caseId: 'case-sup',
      } as any);

      await service.generatePlaybackUrl('rec-sup', 'sup-1', 'SUPERVISOR');

      expect(prismaWrite.auditLog.create).toHaveBeenCalledTimes(1);
      expect(prismaWrite.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'played',
            actorId: 'sup-1',
          }),
        }),
      );
    });
  });

  // ─── Presigned URL TTL = 900s ───────────────────────────────────────────
  describe('generatePlaybackUrl - Presigned URL TTL', () => {
    it('should generate presigned URL with expiresIn: 900', async () => {
      vi.mocked(prismaWrite.recording.findUnique).mockResolvedValue({
        id: 'rec-ttl',
        storageKey: 'recordings/case-ttl/uuid.wav',
        caseId: 'case-ttl',
      } as any);

      await service.generatePlaybackUrl('rec-ttl', 'admin-1', 'ADMIN');

      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(), // S3 client
        expect.anything(), // GetObjectCommand
        { expiresIn: 900 },
      );
    });
  });

  // ─── NotFoundError for missing recording ────────────────────────────────
  describe('generatePlaybackUrl - Not Found', () => {
    it('should throw when recording does not exist', async () => {
      vi.mocked(prismaWrite.recording.findUnique).mockResolvedValue(null);

      await expect(
        service.generatePlaybackUrl('non-existent', 'admin-1', 'ADMIN'),
      ).rejects.toThrow(/not found/);
    });
  });
});
