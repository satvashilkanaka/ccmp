import { Router } from 'express';
import { requireRole } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { qaService } from './qa.service.js';
import { CreateQaReviewSchema, LockCaseSchema } from './qa.dto.js';
import { DEFAULT_QA_RUBRIC } from '@ccmp/shared';
import { logger } from '../../lib/logger.js';

export const qaRouter = Router();

const QA_ROLES = ['QA_ANALYST', 'ADMIN'];

// ── GET /qa/queue ─────────────────────────────────────────────────────────────
// Returns cases ready for QA review (resolved/closed, no existing review)
// Respects the 30-min Redis lock to avoid double-review
qaRouter.get('/queue', requireRole(QA_ROLES), async (req, res) => {
  const reviewerId = req.user!.id;
  const limit = Math.min(parseInt(req.query.limit as string || '20', 10), 100);

  const queue = await qaService.getQaQueue(reviewerId, limit);
  res.json({ items: queue, total: queue.length });
});

// ── POST /qa/reviews ──────────────────────────────────────────────────────────
// Submit a new QA review. Body is validated against createQaReviewSchema.
qaRouter.post('/reviews', requireRole(QA_ROLES), validateBody(CreateQaReviewSchema), async (req, res) => {
  const reviewerId = req.user!.id;
  const payload = req.body; // already validated by middleware

  // Use rubric from request body if provided, otherwise use the default
  const rubric = req.body.rubric ?? DEFAULT_QA_RUBRIC;

  const review = await qaService.createQaReview(payload, reviewerId, rubric);

  logger.info({ reviewId: review.id, caseId: review.caseId }, 'QA review submitted');
  res.status(201).json(review);
});

// ── GET /qa/reviews/:caseId ───────────────────────────────────────────────────
// Returns all QA reviews for a given case
qaRouter.get('/reviews/:caseId', requireRole(QA_ROLES), async (req, res) => {
  const { caseId } = req.params;
  const reviews = await qaService.getReviewsByCaseId(caseId);
  res.json({ items: reviews, total: reviews.length });
});

// ── POST /qa/lock/:caseId ─────────────────────────────────────────────────────
// Acquire or refresh the 30-min review lock before starting a review
qaRouter.post('/lock/:caseId', requireRole(QA_ROLES), validateBody(LockCaseSchema), async (req, res) => {
  const { caseId } = req.params;
  const reviewerId = req.user!.id;

  const acquired = await qaService.acquireLock(caseId, reviewerId);
  if (!acquired) {
    res.status(409).json({
      error: 'Conflict',
      message: 'Another analyst has this case locked for review',
    });
    return;
  }

  res.json({ locked: true, caseId, reviewerId, ttlSeconds: 1800 });
});
