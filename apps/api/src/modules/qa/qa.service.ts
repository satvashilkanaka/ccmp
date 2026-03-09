import { createClient } from 'redis';
import { z } from 'zod';
import { prismaRead, prismaWrite } from '@ccmp/database';
import {
  ComplianceFlag,
  QaRubricItem,
  QaRubricScore,
  CreateQaReviewInput,
  DEFAULT_QA_RUBRIC,
} from '@ccmp/shared';
import { logger } from '../../lib/logger.js';
import { BadRequestError, NotFoundError, ConflictError } from '../../lib/errors.js';

// ── Redis client for review locks ─────────────────────────────────────────────
const redis = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
redis.connect().catch((err: any) => logger.error({ err }, 'QA Service Redis connect failed'));

const QA_LOCK_TTL_SECONDS = 1800; // 30 minutes

// ── Zod schema for review submission ─────────────────────────────────────────
export const qaRubricScoreSchema = z.object({
  key: z.string().min(1),
  score: z.number().nonnegative(),
});

export const createQaReviewSchema = z.object({
  caseId: z.string().cuid(),
  complianceFlags: z.array(z.nativeEnum(ComplianceFlag)).default([]),
  coachingNotes: z.string().max(4000).optional(),
  scores: z.array(qaRubricScoreSchema).min(1),
});

export type CreateQaReviewPayload = z.infer<typeof createQaReviewSchema>;

// ── Helper: calculate weighted score ─────────────────────────────────────────
export function calculateWeightedScore(
  rubric: QaRubricItem[],
  scores: QaRubricScore[],
): number {
  // 1. Validate weights sum to exactly 100
  const weightSum = rubric.reduce((acc, item) => acc + item.weightPct, 0);
  if (Math.abs(weightSum - 100) > 0.001) {
    throw new BadRequestError(
      `Rubric weights must sum to 100, but got ${weightSum}`,
    );
  }

  // 2. Build a lookup for fast access
  const rubricByKey = Object.fromEntries(rubric.map((item) => [item.key, item]));

  let totalScore = 0;

  for (const scoreItem of scores) {
    const rubricItem = rubricByKey[scoreItem.key];
    if (!rubricItem) {
      throw new BadRequestError(`Unknown rubric key: "${scoreItem.key}"`);
    }
    if (scoreItem.score > rubricItem.maxScore) {
      throw new BadRequestError(
        `Score ${scoreItem.score} exceeds maxScore ${rubricItem.maxScore} for rubric key "${scoreItem.key}"`,
      );
    }

    // Weighted contribution: (score / maxScore) * weightPct
    const contribution = (scoreItem.score / rubricItem.maxScore) * rubricItem.weightPct;
    totalScore += contribution;
  }

  return Math.round(totalScore * 100) / 100; // round to 2dp
}

// ── QA Service ────────────────────────────────────────────────────────────────
export class QaService {
  /**
   * Returns cases eligible for QA review.
   * Acquires a Redis review lock to prevent double-review.
   */
  async getQaQueue(reviewerId: string, limit = 20) {
    const cases = await prismaRead.case.findMany({
      where: {
        status: { in: ['RESOLVED', 'CLOSED'] as any[] },
        qaReviews: { none: {} },
      },
      include: {
        assignedTo: { select: { firstName: true, lastName: true, email: true } },
        recordings: { select: { id: true, durationSeconds: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    // Filter out cases that are already locked by another reviewer
    const available = await Promise.all(
      cases.map(async (c: any) => {
        const lockKey = `qa:lock:${c.id}`;
        const existing = await redis.get(lockKey);
        if (existing && existing !== reviewerId) return null;
        return c;
      }),
    );

    return available.filter(Boolean);
  }

  /**
   * Creates a QA review for a case.
   * - Acquires Redis lock to prevent race
   * - Validates scores and weights
   * - Persists review and AuditLog in a transaction
   */
  async createQaReview(
    payload: CreateQaReviewPayload,
    reviewerId: string,
    rubric: QaRubricItem[] = DEFAULT_QA_RUBRIC,
  ) {
    const { caseId, scores, complianceFlags, coachingNotes } = payload;

    // 1. Verify case exists
    const existingCase = await prismaRead.case.findUnique({ where: { id: caseId } });
    if (!existingCase) {
      throw new NotFoundError(`Case ${caseId} not found`);
    }

    // 2. Acquire / verify review lock
    const lockKey = `qa:lock:${caseId}`;
    const existingLock = await redis.get(lockKey);
    if (existingLock && existingLock !== reviewerId) {
      throw new ConflictError(
        `Case ${caseId} is currently being reviewed by another analyst`,
      );
    }

    // Refresh lock
    await redis.setEx(lockKey, QA_LOCK_TTL_SECONDS, reviewerId);

    // 3. Check for duplicate review
    const duplicate = await prismaRead.qaReview.findFirst({
      where: { caseId, reviewerId },
    });
    if (duplicate) {
      throw new ConflictError(
        `Reviewer already submitted a review for case ${caseId}`,
      );
    }

    // 4. Validate scores + calculate weighted total
    const totalScore = calculateWeightedScore(rubric, scores);

    // 5. Persist in a single transaction
    const review = await prismaWrite.$transaction(async (tx: any) => {
      const qaReview = await tx.qaReview.create({
        data: {
          caseId,
          reviewerId,
          scores: scores as any,
          totalScore,
          complianceFlags: complianceFlags as string[],
          coachingNotes,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'created',
          resourceType: 'qa_review',
          resourceId: qaReview.id,
          actorId: reviewerId,
          payload: {
            caseId,
            totalScore,
            flagCount: complianceFlags.length,
          },
        },
      });

      return qaReview;
    });

    // 6. Notify compliance officer if there are flags (fire-and-forget)
    if (complianceFlags.length > 0) {
      this.notifyComplianceOfficer(caseId, review.id, complianceFlags).catch((err: any) =>
        logger.error({ err }, 'Failed to notify compliance officer'),
      );
    }

    // 7. Release lock now that review is committed
    await redis.del(lockKey);

    return review;
  }

  /**
   * Returns all QA reviews for a given case.
   */
  async getReviewsByCaseId(caseId: string) {
    const reviews = await prismaRead.qaReview.findMany({
      where: { caseId },
      include: {
        reviewer: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { reviewedAt: 'desc' },
    });
    return reviews;
  }

  /**
   * Acquires (or refreshes) the 30-minute review lock.
   */
  async acquireLock(caseId: string, reviewerId: string): Promise<boolean> {
    const lockKey = `qa:lock:${caseId}`;
    const existing = await redis.get(lockKey);
    if (existing && existing !== reviewerId) return false;
    await redis.setEx(lockKey, QA_LOCK_TTL_SECONDS, reviewerId);
    return true;
  }

  /**
   * Publishes a Redis event to notify online compliance officers.
   * Also persists a CaseEvent for auditing.
   */
  async notifyComplianceOfficer(
    caseId: string,
    reviewId: string,
    flags: ComplianceFlag[],
  ): Promise<void> {
    try {
      await redis.publish(
        'qa:compliance_flag',
        JSON.stringify({ caseId, reviewId, flags, timestamp: new Date().toISOString() }),
      );
      logger.info({ caseId, reviewId, flagCount: flags.length }, 'Compliance officer notified');
    } catch (err: any) {
      logger.error({ err, caseId }, 'Redis publish for compliance notification failed');
    }
  }
}

export const qaService = new QaService();
