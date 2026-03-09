import { prismaWrite, prismaRead, Case, CaseStatus, Prisma, indexCase } from '@ccmp/database';
import { csatQueue } from '@ccmp/shared/src/queues';
import { logger } from '../../lib/logger.js';
import { CreateCaseDto, ListCasesQuery } from './case.dto';
import { BadRequestError, NotFoundError, ConflictError, ForbiddenError } from '../../lib/errors';
import { AuthUser } from '../../middleware/auth';
import { createClient } from 'redis';

// Required setting: must be a top-level const
const VALID_TRANSITIONS: Record<string, string[]> = {
  NEW:                  ['ASSIGNED', 'CLOSED'],
  ASSIGNED:             ['IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'ESCALATED', 'CLOSED'],
  IN_PROGRESS:          ['WAITING_ON_CUSTOMER', 'ESCALATED', 'PENDING_CLOSURE', 'RESOLVED'],
  WAITING_ON_CUSTOMER:  ['IN_PROGRESS', 'ESCALATED', 'RESOLVED'],
  ESCALATED:            ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  PENDING_CLOSURE:      ['RESOLVED', 'CLOSED'],
  RESOLVED:             ['CLOSED'],
  CLOSED:               [],
};

// Singleton Redis publisher for emitting events after transactions
const redisPublisher = createClient({ url: process.env.REDIS_URL });
redisPublisher.connect().catch(console.error);

export class CaseService {
  /**
   * Generates a sequential case number using PostgreSQL's sequence generator.
   */
  async generateCaseNumber(): Promise<string> {
    const result = await prismaWrite.$queryRaw<[{ nextval: bigint }]>`
      SELECT nextval('case_number_seq')
    `;
    return 'CASE-' + String(result[0].nextval).padStart(5, '0');
  }

  /**
   * Creates a new case, calculates SLA, and records the initial case event.
   */
  async createCase(data: CreateCaseDto, actorId: string): Promise<Case> {
    if (!data.priority || !data.channel) {
      throw new BadRequestError('Priority and channel are required');
    }

    // 1. Look up SLA policy by priority and channel
    const slaPolicy = await prismaRead.slaPolicy.findUnique({
      where: {
        priority_channel: {
          priority: data.priority,
          channel: data.channel,
        },
      },
    });

    if (!slaPolicy) {
      throw new NotFoundError(`No SLA policy found for Priority: ${data.priority}, Channel: ${data.channel}`);
    }

    // Calculate SLA due date
    const slaDueAt = new Date();
    slaDueAt.setMinutes(slaDueAt.getMinutes() + slaPolicy.resolutionTimeMinutes);

    // 2. Generate case number
    const caseNumber = await this.generateCaseNumber();

    // 3. Atomically create the Case and the first CaseEvent
    const newCase = await prismaWrite.$transaction(async (tx) => {
      const createdCase = await tx.case.create({
        data: {
          caseNumber,
          subject: data.subject,
          description: data.description,
          channel: data.channel,
          priority: data.priority,
          customerEmail: data.customerEmail,
          customerPhone: data.customerPhone,
          queueId: data.queueId,
          slaPolicyId: slaPolicy.id,
          slaDueAt,
          metadata: (data.metadata || {}) as Prisma.JsonObject,
          status: 'NEW',
        },
      });

      await tx.caseEvent.create({
        data: {
          caseId: createdCase.id,
          eventType: 'case.created',
          actorId,
          payload: {
            subject: createdCase.subject,
            channel: createdCase.channel,
            priority: createdCase.priority,
          },
        },
      });

      return createdCase;
    });

    // 4. Post-transaction, publish event to Redis
    await redisPublisher.publish(
      'case:new',
      JSON.stringify({
        caseId: newCase.id,
        queueId: newCase.queueId,
        priority: newCase.priority,
        channel: newCase.channel,
      })
    );

    // 5. Fire and forget Meilisearch indexing
    indexCase(newCase).catch(console.error);

    return newCase;
  }

  /**
   * Transitions a case status, enforcing optimistic locking and validating state machine.
   */
  async transitionStatus(caseId: string, newStatus: string, actorId: string, version: number): Promise<Case> {
    // 1. Fetch current case state
    const currentCase = await prismaRead.case.findUnique({ where: { id: caseId } });
    if (!currentCase) {
      throw new NotFoundError(`Case ${caseId} not found`);
    }

    // 2. State Machine check using the top-level VALID_TRANSITIONS map
    const allowedTransitions = VALID_TRANSITIONS[currentCase.status] || [];
    if (!allowedTransitions.includes(newStatus)) {
      throw new BadRequestError(`Invalid transition: Cannot move from ${currentCase.status} to ${newStatus}`);
    }

    // 3. Update using optimistic locking updateMany to assert the expected version
    const result = await prismaWrite.case.updateMany({
      where: {
        id: caseId,
        version: version, // Must match what the client thinks the version is
      },
      data: {
        status: newStatus as CaseStatus,
        version: { increment: 1 },
      },
    });

    if (result.count === 0) {
      throw new ConflictError('Case was modified by another user — please refresh');
    }

    // 4. Record transition event
    await prismaWrite.caseEvent.create({
      data: {
        caseId,
        eventType: 'case.status_changed',
        actorId,
        payload: {
          oldStatus: currentCase.status,
          newStatus,
          version: version + 1
        },
      },
    });

    // 5. Publish status change to Redis
    await redisPublisher.publish(
      'case:status_changed',
      JSON.stringify({
        caseId,
        oldStatus: currentCase.status,
        newStatus,
      })
    );

    // Fetch the updated case to return
    const updatedCase = await prismaRead.case.findUnique({ where: { id: caseId } });
    
    // Update Meilisearch asynchronously
    if (updatedCase) {
      indexCase(updatedCase).catch(console.error);

      // trigger CSAT survey if CLOSED
      if (newStatus === 'CLOSED' && updatedCase.customerEmail) {
        csatQueue.add(
          'send-csat',
          { caseId, customerEmail: updatedCase.customerEmail },
          { delay: 900_000 } // 15 minutes
        ).catch((err) => logger.error({ err, caseId }, 'Failed to queue CSAT job'));
      }
    }
    
    return updatedCase!;
  }

  /**
   * Returns a paginated list of cases, applying scoped query logic based on User Role.
   */
  async listCases(user: AuthUser, query: ListCasesQuery): Promise<{ items: Case[]; nextCursor?: string; hasMore: boolean }> {
    const where: Prisma.CaseWhereInput = {};

    // Map filters from DTO
    if (query.status) where.status = query.status;
    if (query.priority) where.priority = query.priority;
    if (query.channel) where.channel = query.channel;

    // Apply strict RBAC scoping rules
    if (user.role === 'AGENT') {
      where.assignedToId = user.id;
    } else if (user.role === 'SENIOR_AGENT') {
      // Look up teamId since not currently in AuthUser by default
      const userRec = await prismaRead.user.findUnique({ where: { id: user.id }, select: { teamId: true } });
      if (userRec?.teamId) {
        where.OR = [
          { assignedToId: user.id },
          { teamId: userRec.teamId }
        ];
      } else {
        where.assignedToId = user.id;
      }
    } else if (['SUPERVISOR', 'OPERATIONS_MANAGER', 'ADMIN'].includes(user.role)) {
       // no additional filters, see all except restricted maybe? Prompt says:
       // "SUPERVISOR, OPERATIONS_MANAGER, ADMIN: no additional filter"
    } else if (['QA_ANALYST', 'COMPLIANCE_OFFICER'].includes(user.role)) {
       // all cases
    }

    const take = query.limit || 25;
    
    // Prisma pagination args
    const findArgs: Prisma.CaseFindManyArgs = {
      where,
      take: take + 1, // Fetch +1 to determine if there is a next page
      orderBy: { createdAt: 'desc' },
    };

    if (query.cursor) {
      findArgs.cursor = { id: query.cursor };
      findArgs.skip = 1; // skip the cursor itself
    }

    const items = await prismaRead.case.findMany(findArgs);
    
    const hasMore = items.length > take;
    const finalItems = items.slice(0, take);
    const nextCursor = hasMore ? finalItems[take - 1]?.id : undefined;

    return {
      items: finalItems,
      nextCursor,
      hasMore,
    };
  }

  /**
   * Fetches a specific user case enforcing read constraints.
   */
  async getCaseById(caseId: string, user: AuthUser): Promise<Case> {
    const caseRecord = await prismaRead.case.findUnique({
      where: { id: caseId },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
        team: { select: { id: true, name: true } },
        events: { orderBy: { createdAt: 'desc' } }
      }
    });

    if (!caseRecord) {
      throw new NotFoundError(`Case ${caseId} not found`);
    }

    // Read enforcement logic
    if (user.role === 'AGENT') {
      // Agents can only view cases they are explicitly assigned to
      if (caseRecord.assignedToId !== user.id) {
        throw new ForbiddenError('You do not have permission to view this case.');
      }
    } else if (user.role === 'SENIOR_AGENT') {
      const agentRecord = await prismaRead.user.findUnique({ where: { id: user.id } });
      if (caseRecord.assignedToId !== user.id && caseRecord.teamId !== agentRecord?.teamId) {
        throw new ForbiddenError('You do not have permission to view this case.');
      }
    }

    return caseRecord;
  }
}
