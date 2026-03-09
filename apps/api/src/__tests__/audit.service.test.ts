import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { auditService } from '../modules/audit/audit.service';
import crypto from 'crypto';

// ── Mocks ─────────────────────────────────────────────────────────────────────
vi.mock('@ccmp/database', () => ({
  prismaRead: {
    auditLog: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock('pdfkit', () => {
  return {
    default: vi.fn().mockImplementation(() => {
      let buffers: any[] = [];
      let onData: any = null;
      let onEnd: any = null;

      return {
        on: (event: string, callback: any) => {
          if (event === 'data') onData = callback;
          if (event === 'end') onEnd = callback;
        },
        fontSize: vi.fn().mockReturnThis(),
        font: vi.fn().mockReturnThis(),
        text: vi.fn().mockReturnThis(),
        moveDown: vi.fn().mockReturnThis(),
        moveTo: vi.fn().mockReturnThis(),
        lineTo: vi.fn().mockReturnThis(),
        stroke: vi.fn().mockReturnThis(),
        addPage: vi.fn().mockReturnThis(),
        get y() { return 100; },
        end: () => {
          if (onData) onData(Buffer.from('mock-pdf-content'));
          if (onEnd) onEnd();
        },
      };
    }),
  };
});

vi.mock('crypto', () => {
  const actualCrypto = vi.importActual('crypto');
  return {
    ...actualCrypto,
    default: {
      createSign: vi.fn().mockReturnValue({
        update: vi.fn(),
        end: vi.fn(),
        sign: vi.fn().mockReturnValue('mock-base64-signature'),
      }),
    },
  };
});

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { prismaRead } from '@ccmp/database';

describe('AuditService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAuditLogs', () => {
    it('should query and return audit logs', async () => {
      const mockItems = [{ id: '1', action: 'viewed' }];
      vi.mocked(prismaRead.auditLog.findMany).mockResolvedValue(mockItems as any);
      vi.mocked(prismaRead.auditLog.count).mockResolvedValue(1);

      const result = await auditService.getAuditLogs({ limit: 10, offset: 0 });
      expect(result.items).toEqual(mockItems);
      expect(result.total).toBe(1);
      expect(result.limit).toBe(10);
    });
  });

  describe('getUserAccessHistory', () => {
    it('should throw if userId is not provided', async () => {
      await expect(auditService.getUserAccessHistory('')).rejects.toThrow('User ID is required');
    });

    it('should return logs for a specific user', async () => {
      const mockItems = [{ id: '1', actorId: 'user-1' }];
      vi.mocked(prismaRead.auditLog.findMany).mockResolvedValue(mockItems as any);
      vi.mocked(prismaRead.auditLog.count).mockResolvedValue(1);

      const result = await auditService.getUserAccessHistory('user-1');
      expect(prismaRead.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { actorId: 'user-1' } })
      );
      expect(result.items).toEqual(mockItems);
    });
  });

  describe('exportAuditTrail', () => {
    const originalEnv = process.env.AUDIT_EXPORT_PRIVATE_KEY;

    beforeEach(() => {
      process.env.AUDIT_EXPORT_PRIVATE_KEY = 'mock-private-key';
    });

    afterEach(() => {
      process.env.AUDIT_EXPORT_PRIVATE_KEY = originalEnv;
    });

    it('should generate a signed PDF export', async () => {
      vi.mocked(prismaRead.auditLog.findMany).mockResolvedValue([
        { id: '1', action: 'viewed', createdAt: new Date() },
      ] as any);
      vi.mocked(prismaRead.auditLog.count).mockResolvedValue(1);

      const buffer = await auditService.exportAuditTrail({}, 'exporter-1');
      
      expect(buffer).toBeInstanceOf(Buffer);
      const strBuffer = buffer.toString('utf-8');
      
      // Verify our mock PDF content and trailing signature exist
      expect(strBuffer).toContain('mock-pdf-content');
      expect(strBuffer).toContain('CCMP AUDIT SIGNATURE');
      expect(strBuffer).toContain('mock-base64-signature');
    });

    it('should yield unsigned PDF if private key is missing', async () => {
      process.env.AUDIT_EXPORT_PRIVATE_KEY = '';

      vi.mocked(prismaRead.auditLog.findMany).mockResolvedValue([] as any);
      vi.mocked(prismaRead.auditLog.count).mockResolvedValue(0);

      const buffer = await auditService.exportAuditTrail({}, 'exporter-1');
      const strBuffer = buffer.toString('utf-8');
      
      expect(strBuffer).toContain('mock-pdf-content');
      expect(strBuffer).not.toContain('CCMP AUDIT SIGNATURE');
    });
  });
});
