import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { processSlaJob, SlaProcessorDeps } from '../processors/sla.handler';

// ── Build mock dependencies ─────────────────────────────────────────────────
function createMockDeps(overrides: Partial<SlaProcessorDeps> = {}): SlaProcessorDeps {
  return {
    findCase: vi.fn().mockResolvedValue(null),
    runTransaction: vi.fn(async (fn: any) => {
      const mockTx = {
        case: { update: vi.fn() },
        caseEvent: { create: vi.fn() },
        auditLog: { create: vi.fn() },
      };
      await fn(mockTx);
      return mockTx;
    }),
    createAuditLog: vi.fn().mockResolvedValue({}),
    publishEvent: vi.fn().mockResolvedValue(1),
    CaseStatus: {
      NEW: 'NEW', ASSIGNED: 'ASSIGNED', IN_PROGRESS: 'IN_PROGRESS',
      WAITING_ON_CUSTOMER: 'WAITING_ON_CUSTOMER', ESCALATED: 'ESCALATED',
      RESOLVED: 'RESOLVED', CLOSED: 'CLOSED',
    },
    UserRole: {
      AGENT: 'AGENT', SENIOR_AGENT: 'SENIOR_AGENT', SUPERVISOR: 'SUPERVISOR',
      OPERATIONS_MANAGER: 'OPERATIONS_MANAGER', ADMIN: 'ADMIN',
    },
    ...overrides,
  };
}

describe('SLA Processor (processSlaJob)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-08T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── (a) Warning cancels on case resolve ─────────────────────────────────
  describe('warning job', () => {
    it('should skip warning if case is RESOLVED', async () => {
      const deps = createMockDeps({
        findCase: vi.fn().mockResolvedValue({ id: 'case-1', status: 'RESOLVED' }),
      });

      await processSlaJob({ caseId: 'case-1', type: 'warning' }, deps);
      expect(deps.createAuditLog).not.toHaveBeenCalled();
      expect(deps.publishEvent).not.toHaveBeenCalled();
    });

    it('should fire warning event for an active case', async () => {
      const deps = createMockDeps({
        findCase: vi.fn().mockResolvedValue({
          id: 'case-1', status: 'IN_PROGRESS',
          assignedTo: { role: 'AGENT' },
        }),
      });

      await processSlaJob({ caseId: 'case-1', type: 'warning' }, deps);

      expect(deps.publishEvent).toHaveBeenCalledWith('sla:warning', expect.any(String));
      expect(deps.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SLA_WARNING_TRIGGERED',
          resourceType: 'CASE',
          resourceId: 'case-1',
        }),
      );
    });
  });

  // ─── (b) Breach skips CLOSED case ────────────────────────────────────────
  describe('breach job', () => {
    it('should skip breach escalation if case is CLOSED', async () => {
      const deps = createMockDeps({
        findCase: vi.fn().mockResolvedValue({ id: 'case-2', status: 'CLOSED' }),
      });

      await processSlaJob({ caseId: 'case-2', type: 'breach' }, deps);
      expect(deps.runTransaction).not.toHaveBeenCalled();
    });

    it('should escalate an active case on breach', async () => {
      const mockTx = {
        case: { update: vi.fn() },
        caseEvent: { create: vi.fn() },
        auditLog: { create: vi.fn() },
      };
      const deps = createMockDeps({
        findCase: vi.fn().mockResolvedValue({
          id: 'case-3', status: 'IN_PROGRESS',
          assignedTo: { role: 'AGENT' },
        }),
        runTransaction: vi.fn(async (fn: any) => fn(mockTx)),
      });

      await processSlaJob({ caseId: 'case-3', type: 'breach' }, deps);

      expect(deps.runTransaction).toHaveBeenCalled();
      expect(mockTx.case.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'case-3' },
          data: expect.objectContaining({ status: 'ESCALATED' }),
        }),
      );
      expect(mockTx.caseEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ caseId: 'case-3', eventType: 'SLA_BREACHED' }),
        }),
      );
      expect(deps.publishEvent).toHaveBeenCalledWith('sla:breached', expect.any(String));
    });
  });

  // ─── (c) SLA override reschedules ────────────────────────────────────────
  describe('SLA override reschedule', () => {
    it('should not process breach if case already resolved (post-override)', async () => {
      const deps = createMockDeps({
        findCase: vi.fn().mockResolvedValue({ id: 'case-override', status: 'RESOLVED' }),
      });

      await processSlaJob({ caseId: 'case-override', type: 'breach' }, deps);
      expect(deps.runTransaction).not.toHaveBeenCalled();
    });

    it('should handle rescheduled warning for active case', async () => {
      const deps = createMockDeps({
        findCase: vi.fn().mockResolvedValue({
          id: 'case-resched', status: 'IN_PROGRESS',
          assignedTo: { role: 'AGENT' },
        }),
      });

      await processSlaJob({ caseId: 'case-resched', type: 'warning' }, deps);

      expect(deps.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SLA_WARNING_TRIGGERED',
          resourceId: 'case-resched',
        }),
      );
    });
  });

  // ─── (d) Missing/invalid payloads ────────────────────────────────────────
  describe('edge cases', () => {
    it('should silently skip when case not found in DB', async () => {
      const deps = createMockDeps({
        findCase: vi.fn().mockResolvedValue(null),
      });

      await processSlaJob({ caseId: 'non-existent', type: 'warning' }, deps);
      expect(deps.createAuditLog).not.toHaveBeenCalled();
    });

    it('should throw for unknown job type', async () => {
      const deps = createMockDeps({
        findCase: vi.fn().mockResolvedValue({ id: 'case-4', status: 'IN_PROGRESS' }),
      });

      await expect(processSlaJob({ caseId: 'case-4', type: 'unknown' }, deps))
        .rejects.toThrow(/Unknown job classification type/);
    });

    it('should throw when payload fields are missing', async () => {
      const deps = createMockDeps();
      await expect(processSlaJob({ caseId: '', type: '' }, deps))
        .rejects.toThrow('Invalid Job Payload');
    });

    it('should escalate to OPERATIONS_MANAGER when current role is SUPERVISOR', async () => {
      const mockTx = {
        case: { update: vi.fn() },
        caseEvent: { create: vi.fn() },
        auditLog: { create: vi.fn() },
      };
      const deps = createMockDeps({
        findCase: vi.fn().mockResolvedValue({
          id: 'case-5', status: 'IN_PROGRESS',
          assignedTo: { role: 'SUPERVISOR' },
        }),
        runTransaction: vi.fn(async (fn: any) => fn(mockTx)),
      });

      await processSlaJob({ caseId: 'case-5', type: 'breach' }, deps);

      expect(mockTx.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            payload: { nextRole: 'OPERATIONS_MANAGER' },
          }),
        }),
      );
    });
  });
});
