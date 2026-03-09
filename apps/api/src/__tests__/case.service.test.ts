import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CaseService } from '../modules/cases/case.service';
import { prismaRead, prismaWrite } from '@ccmp/database';
import { BadRequestError, ConflictError, NotFoundError } from '../lib/errors';

// Mock dependencies
vi.mock('@ccmp/database', () => {
  return {
    prismaWrite: {
      $queryRaw: vi.fn(),
      $transaction: vi.fn(),
      case: { updateMany: vi.fn() },
      caseEvent: { create: vi.fn() }
    },
    prismaRead: {
      slaPolicy: { findUnique: vi.fn() },
      case: { findUnique: vi.fn(), findMany: vi.fn() },
      user: { findUnique: vi.fn() }
    },
    CaseChannel: { PHONE: 'PHONE', EMAIL: 'EMAIL', CHAT: 'CHAT' },
    CasePriority: { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', URGENT: 'URGENT' },
    CaseStatus: { NEW: 'NEW', ASSIGNED: 'ASSIGNED', IN_PROGRESS: 'IN_PROGRESS', RESOLVED: 'RESOLVED', CLOSED: 'CLOSED' },
    indexCase: vi.fn().mockResolvedValue(undefined)
  };
});

// Mock Redis
vi.mock('redis', () => ({
  createClient: vi.fn().mockReturnValue({
    connect: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockResolvedValue(true)
  })
}));

describe('CaseService', () => {
  let caseService: CaseService;

  beforeEach(() => {
    vi.clearAllMocks();
    caseService = new CaseService();
  });

  describe('generateCaseNumber', () => {
    it('should create a case with correct case number format', async () => {
      vi.mocked(prismaWrite.$queryRaw).mockResolvedValue([{ nextval: 42n }]);
      const result = await caseService.generateCaseNumber();
      expect(result).toBe('CASE-00042');
      expect(result).toMatch(/^CASE-\d{5}$/);
    });
  });

  describe('State Machine Transitions - VALID_TRANSITIONS', () => {
    const validTransitions = [
      ['NEW', 'ASSIGNED'],
      ['NEW', 'CLOSED'],
      ['ASSIGNED', 'IN_PROGRESS'],
      ['ASSIGNED', 'WAITING_ON_CUSTOMER'],
      ['ASSIGNED', 'ESCALATED'],
      ['ASSIGNED', 'CLOSED'],
      ['IN_PROGRESS', 'WAITING_ON_CUSTOMER'],
      ['IN_PROGRESS', 'ESCALATED'],
      ['IN_PROGRESS', 'PENDING_CLOSURE'],
      ['IN_PROGRESS', 'RESOLVED'],
      ['WAITING_ON_CUSTOMER', 'IN_PROGRESS'],
      ['WAITING_ON_CUSTOMER', 'ESCALATED'],
      ['WAITING_ON_CUSTOMER', 'RESOLVED'],
      ['ESCALATED', 'IN_PROGRESS'],
      ['ESCALATED', 'RESOLVED'],
      ['ESCALATED', 'CLOSED'],
      ['PENDING_CLOSURE', 'RESOLVED'],
      ['PENDING_CLOSURE', 'CLOSED'],
      ['RESOLVED', 'CLOSED']
    ];

    it.each(validTransitions)('should transition %s → %s successfully', async (fromStatus, toStatus) => {
      vi.mocked(prismaRead.case.findUnique).mockResolvedValue({ id: 'case-1', status: fromStatus } as any);
      vi.mocked(prismaWrite.case.updateMany).mockResolvedValue({ count: 1 });
      
      await caseService.transitionStatus('case-1', toStatus, 'actor-1', 1);
      
      expect(prismaWrite.case.updateMany).toHaveBeenCalledWith({
        where: { id: 'case-1', version: 1 },
        data: { status: toStatus, version: { increment: 1 } }
      });
    });

    it('should throw BadRequestError for NEW → CLOSED transition via invalid state (like NEW to RESOLVED directly)', async () => {
      vi.mocked(prismaRead.case.findUnique).mockResolvedValue({ id: 'case-1', status: 'NEW' } as any);
      
      await expect(caseService.transitionStatus('case-1', 'RESOLVED', 'actor-1', 1))
        .rejects.toThrow(BadRequestError);
      await expect(caseService.transitionStatus('case-1', 'RESOLVED', 'actor-1', 1))
        .rejects.toThrow(/Invalid transition: Cannot move from NEW to RESOLVED/);
    });
  });

  describe('Optimistic Locking', () => {
    it('should throw ConflictError on stale version', async () => {
      vi.mocked(prismaRead.case.findUnique).mockResolvedValue({ id: 'case-1', status: 'NEW' } as any);
      // Simulate 0 records updated due to mismatching version
      vi.mocked(prismaWrite.case.updateMany).mockResolvedValue({ count: 0 });
      
      await expect(caseService.transitionStatus('case-1', 'ASSIGNED', 'actor-1', 1))
        .rejects.toThrow(ConflictError);
      await expect(caseService.transitionStatus('case-1', 'ASSIGNED', 'actor-1', 1))
        .rejects.toThrow(/modified by another user/);
    });
  });

  describe('RBAC for listCases', () => {
    it('AGENT role only sees own cases in listCases', async () => {
      vi.mocked(prismaRead.case.findMany).mockResolvedValue([]);
      const user = { id: 'agent-1', role: 'AGENT', email: 'agent@ccmp.com', sessionId: 's-1' };
      
      await caseService.listCases(user, { limit: 10 });
      
      expect(prismaRead.case.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { assignedToId: 'agent-1' }
        })
      );
    });
  });

  describe('Concurrent Updates', () => {
    it('should throw ConflictError when two updates race on the same version', async () => {
      // Both callers see the same case at version 1
      vi.mocked(prismaRead.case.findUnique).mockResolvedValue({
        id: 'case-race',
        status: 'NEW',
        version: 1,
      } as any);

      // First update succeeds (count: 1), second fails (count: 0)
      vi.mocked(prismaWrite.case.updateMany)
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      const results = await Promise.allSettled([
        caseService.transitionStatus('case-race', 'ASSIGNED', 'actor-1', 1),
        caseService.transitionStatus('case-race', 'ASSIGNED', 'actor-2', 1),
      ]);

      // One should succeed, one should throw ConflictError
      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);
    });
  });
});
