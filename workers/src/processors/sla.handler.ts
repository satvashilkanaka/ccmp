/**
 * Extracted SLA processor logic — testable without BullMQ Worker, Redis, or side effects.
 * The actual `sla.processor.ts` calls this function from within its Worker callback.
 */

export interface SlaJobData {
  caseId: string;
  type: string;
}

export interface SlaProcessorDeps {
  findCase: (id: string) => Promise<any>;
  runTransaction: (fn: (tx: any) => Promise<void>) => Promise<void>;
  createAuditLog: (data: any) => Promise<any>;
  publishEvent: (channel: string, payload: string) => Promise<any>;
  CaseStatus: Record<string, string>;
  UserRole: Record<string, string>;
}

const ESCALATION_CHAIN_ROLES = ['SENIOR_AGENT', 'SUPERVISOR', 'OPERATIONS_MANAGER'];

function getNextEscalationRole(currentRole?: string | null): string {
  if (!currentRole) return 'SUPERVISOR';
  const idx = ESCALATION_CHAIN_ROLES.indexOf(currentRole);
  if (idx === -1 || idx === ESCALATION_CHAIN_ROLES.length - 1) {
    return 'OPERATIONS_MANAGER';
  }
  return ESCALATION_CHAIN_ROLES[idx + 1];
}

export async function processSlaJob(data: SlaJobData, deps: SlaProcessorDeps): Promise<void> {
  const { caseId, type } = data;
  if (!caseId || !type) throw new Error('Invalid Job Payload');

  // 1. Fetch fresh Case
  const freshCase = await deps.findCase(caseId);
  if (!freshCase) {
    console.warn(`[SLA] Case ${caseId} not found, skipping.`);
    return;
  }

  // 2. Skip resolved/closed cases
  if (freshCase.status === deps.CaseStatus.RESOLVED || freshCase.status === deps.CaseStatus.CLOSED) {
    console.debug(`[SLA] Case ${caseId} is already ${freshCase.status}, safely skipping job.`);
    return;
  }

  // 3. Process Warning
  if (type === 'warning') {
    await deps.publishEvent('sla:warning', JSON.stringify({
      caseId,
      message: 'SLA Warning Threshold Breached',
      timestamp: new Date().toISOString(),
    }));

    await deps.createAuditLog({
      action: 'SLA_WARNING_TRIGGERED',
      resourceType: 'CASE',
      resourceId: caseId,
      payload: { warningTriggeredAt: new Date().toISOString() },
    });
    return;
  }

  // 4. Process Breach
  if (type === 'breach') {
    await deps.runTransaction(async (tx: any) => {
      const nextRole = getNextEscalationRole(freshCase.assignedTo?.role);

      await tx.case.update({
        where: { id: caseId },
        data: { status: deps.CaseStatus.ESCALATED, slaBreachedAt: new Date() },
      });

      await tx.caseEvent.create({
        data: {
          caseId,
          eventType: 'SLA_BREACHED',
          payload: { escalatedRoleTarget: nextRole, breachedAt: new Date().toISOString() },
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'SLA_BREACH_ESCALATED',
          resourceType: 'CASE',
          resourceId: caseId,
          payload: { nextRole },
        },
      });
    });

    await deps.publishEvent('sla:breached', JSON.stringify({
      caseId,
      escalated: true,
      timestamp: new Date().toISOString(),
    }));
    return;
  }

  throw new Error(`Unknown job classification type: ${type}`);
}
