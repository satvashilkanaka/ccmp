import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateWeightedScore, QaService } from '../modules/qa/qa.service';
import { ComplianceFlag, DEFAULT_QA_RUBRIC } from '@ccmp/shared';
import { BadRequestError, ConflictError, NotFoundError } from '../lib/errors';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@ccmp/database', () => ({
  prismaWrite: {
    qaReview: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(async (fn: any) => {
      const tx = {
        qaReview: { create: vi.fn().mockResolvedValue({ id: 'qa-1', caseId: 'case-1', reviewedAt: new Date() }) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      };
      return fn(tx);
    }),
  },
  prismaRead: {
    case: { findUnique: vi.fn() },
    qaReview: { findFirst: vi.fn() },
  },
}));

vi.mock('redis', () => {
  const mockRedisClient = {
    connect: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    setEx: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    publish: vi.fn().mockResolvedValue(1),
    findMany: vi.fn().mockResolvedValue([]),
    on: vi.fn(),
  };
  return {
    createClient: vi.fn().mockReturnValue(mockRedisClient),
  };
});

vi.mock('@ccmp/shared', () => ({
  DEFAULT_QA_RUBRIC: [
    { key: 'greeting',        label: 'Professional Greeting',     weightPct: 10, maxScore: 10 },
    { key: 'verification',    label: 'Customer Verification',      weightPct: 15, maxScore: 10 },
    { key: 'empathy',         label: 'Empathy & Active Listening', weightPct: 20, maxScore: 10 },
    { key: 'resolution',      label: 'Resolution Quality',         weightPct: 25, maxScore: 10 },
    { key: 'compliance',      label: 'Compliance Adherence',       weightPct: 20, maxScore: 10 },
    { key: 'close',           label: 'Call Close',                 weightPct: 10, maxScore: 10 },
  ],
  ComplianceFlag: {
    PCI_DTMF_PAUSE_NOT_USED: 'PCI_DTMF_PAUSE_NOT_USED',
    AGENT_ID_NOT_VERIFIED: 'AGENT_ID_NOT_VERIFIED',
    SENSITIVE_DATA_SPOKEN: 'SENSITIVE_DATA_SPOKEN',
    CALL_ABRUPTLY_ENDED: 'CALL_ABRUPTLY_ENDED',
    SLA_MISREPRESENTED: 'SLA_MISREPRESENTED',
  }
}));

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { prismaRead, prismaWrite } from '@ccmp/database';

// ── calculateWeightedScore ────────────────────────────────────────────────────

describe('calculateWeightedScore', () => {
  it('should calculate correct weighted score with perfect marks', () => {
    const scores = DEFAULT_QA_RUBRIC.map((item) => ({ key: item.key, score: item.maxScore }));
    const result = calculateWeightedScore(DEFAULT_QA_RUBRIC, scores);
    expect(result).toBe(100);
  });

  it('should calculate correct weighted score with zero marks', () => {
    const scores = DEFAULT_QA_RUBRIC.map((item) => ({ key: item.key, score: 0 }));
    const result = calculateWeightedScore(DEFAULT_QA_RUBRIC, scores);
    expect(result).toBe(0);
  });

  it('should calculate partial score correctly', () => {
    const scores = DEFAULT_QA_RUBRIC.map((item) => ({ key: item.key, score: item.maxScore / 2 }));
    const result = calculateWeightedScore(DEFAULT_QA_RUBRIC, scores);
    expect(result).toBe(50);
  });

  it('should throw BadRequestError when weights do not sum to 100', () => {
    const badRubric = [
      { key: 'a', label: 'A', weightPct: 60, maxScore: 10 },
      { key: 'b', label: 'B', weightPct: 30, maxScore: 10 }, // only 90
    ];
    const scores = [{ key: 'a', score: 5 }, { key: 'b', score: 5 }];
    expect(() => calculateWeightedScore(badRubric, scores)).toThrow(BadRequestError);
    expect(() => calculateWeightedScore(badRubric, scores)).toThrow(/weights must sum to 100/);
  });

  it('should throw BadRequestError when score exceeds maxScore', () => {
    const scores = DEFAULT_QA_RUBRIC.map((item, idx) =>
      idx === 0
        ? { key: item.key, score: item.maxScore + 5 } // over max
        : { key: item.key, score: 0 }
    );
    expect(() => calculateWeightedScore(DEFAULT_QA_RUBRIC, scores)).toThrow(BadRequestError);
    expect(() => calculateWeightedScore(DEFAULT_QA_RUBRIC, scores)).toThrow(/exceeds maxScore/);
  });

  it('should throw BadRequestError for unknown rubric key', () => {
    const scores = [{ key: 'unknown_key', score: 5 }];
    expect(() => calculateWeightedScore(DEFAULT_QA_RUBRIC, scores)).toThrow(BadRequestError);
    expect(() => calculateWeightedScore(DEFAULT_QA_RUBRIC, scores)).toThrow(/Unknown rubric key/);
  });
});

// ── QaService ─────────────────────────────────────────────────────────────────

describe('QaService', () => {
  let service: QaService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new QaService();
    // Re-setup the transaction mock each time
    (prismaWrite as any).$transaction = vi.fn(async (fn: any) => {
      const tx = {
        qaReview: {
          create: vi.fn().mockResolvedValue({
            id: 'qa-review-1',
            caseId: 'case-1',
            reviewedAt: new Date(),
            totalScore: 75,
          }),
        },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      };
      return fn(tx);
    });
  });

  describe('createQaReview', () => {
    const validPayload = {
      caseId: 'clxyz123456789012345678',
      scores: DEFAULT_QA_RUBRIC.map((item) => ({ key: item.key, score: item.maxScore * 0.75 })),
      complianceFlags: [] as ComplianceFlag[],
      coachingNotes: 'Good call overall, minor compliance gap.',
    };

    it('should throw NotFoundError when case does not exist', async () => {
      vi.mocked(prismaRead.case.findUnique).mockResolvedValue(null);

      await expect(service.createQaReview(validPayload, 'reviewer-1')).rejects.toThrow(NotFoundError);
    });

    it('should create a QA review and an AuditLog in the same transaction', async () => {
      vi.mocked(prismaRead.case.findUnique).mockResolvedValue({ id: 'case-1' } as any);
      vi.mocked(prismaRead.qaReview.findFirst).mockResolvedValue(null);

      let txQaCreate: ReturnType<typeof vi.fn> | null = null;
      let txAuditCreate: ReturnType<typeof vi.fn> | null = null;

      (prismaWrite as any).$transaction = vi.fn(async (fn: any) => {
        const tx = {
          qaReview: { create: vi.fn().mockResolvedValue({ id: 'qa-1', caseId: 'case-1', reviewedAt: new Date(), totalScore: 75 }) },
          auditLog: { create: vi.fn().mockResolvedValue({}) },
        };
        txQaCreate = tx.qaReview.create;
        txAuditCreate = tx.auditLog.create;
        return fn(tx);
      });

      await service.createQaReview(validPayload, 'reviewer-1');

      // Both review and audit log should be created in the same tx
      expect(txQaCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            caseId: validPayload.caseId,
            reviewerId: 'reviewer-1',
            totalScore: expect.any(Number),
          }),
        }),
      );
      expect(txAuditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'created',
            resourceType: 'qa_review',
            actorId: 'reviewer-1',
          }),
        }),
      );
    });

    it('should throw ConflictError when another reviewer has the lock', async () => {
      vi.mocked(prismaRead.case.findUnique).mockResolvedValue({ id: 'case-1' } as any);
      vi.mocked(prismaRead.qaReview.findFirst).mockResolvedValue(null);

      // Simulate lock held by a different reviewer
      const { createClient } = await import('redis');
      const mockRedis = createClient();
      vi.mocked(mockRedis.get).mockResolvedValueOnce('other-reviewer-id');

      const service2 = new QaService();
      await expect(service2.createQaReview(validPayload, 'reviewer-1')).rejects.toThrow(ConflictError);
    });

    it('should throw ConflictError on duplicate review by same reviewer', async () => {
      vi.mocked(prismaRead.case.findUnique).mockResolvedValue({ id: 'case-1' } as any);
      // Return existing review from the same reviewer
      vi.mocked(prismaRead.qaReview.findFirst).mockResolvedValue({
        id: 'existing-review',
        caseId: 'case-1',
        reviewerId: 'reviewer-1',
      } as any);

      await expect(service.createQaReview(validPayload, 'reviewer-1')).rejects.toThrow(ConflictError);
    });

    it('should notify compliance officer when flags are present', async () => {
      vi.mocked(prismaRead.case.findUnique).mockResolvedValue({ id: 'case-1' } as any);
      vi.mocked(prismaRead.qaReview.findFirst).mockResolvedValue(null);

      const notifySpy = vi.spyOn(service, 'notifyComplianceOfficer').mockResolvedValue(undefined);

      await service.createQaReview(
        {
          ...validPayload,
          complianceFlags: [ComplianceFlag.SENSITIVE_DATA_SPOKEN],
        },
        'reviewer-1',
      );

      expect(notifySpy).toHaveBeenCalledWith(
        validPayload.caseId,
        expect.any(String),
        [ComplianceFlag.SENSITIVE_DATA_SPOKEN],
      );
    });

    it('should NOT notify compliance officer when no flags', async () => {
      vi.mocked(prismaRead.case.findUnique).mockResolvedValue({ id: 'case-1' } as any);
      vi.mocked(prismaRead.qaReview.findFirst).mockResolvedValue(null);

      const notifySpy = vi.spyOn(service, 'notifyComplianceOfficer').mockResolvedValue(undefined);

      await service.createQaReview({ ...validPayload, complianceFlags: [] }, 'reviewer-1');

      expect(notifySpy).not.toHaveBeenCalled();
    });
  });

  describe('acquireLock', () => {
    it('should return false when another reviewer holds the lock', async () => {
      const { createClient } = await import('redis');
      const mockRedis = createClient();
      vi.mocked(mockRedis.get).mockResolvedValueOnce('other-reviewer');

      const result = await service.acquireLock('case-lock', 'reviewer-1');
      expect(result).toBe(false);
    });

    it('should allow same reviewer to re-acquire their own lock', async () => {
      const { createClient } = await import('redis');
      const mockRedis = createClient();
      // Same reviewer re-acquiring
      vi.mocked(mockRedis.get).mockResolvedValueOnce('reviewer-1');

      const result = await service.acquireLock('case-reacquire', 'reviewer-1');
      expect(result).toBe(true);
    });
  });
});
