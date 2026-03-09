import { Router } from 'express';
import { prismaRead, prismaWrite } from '@ccmp/database';
import { logger } from '../../lib/logger.js';
import jwt from 'jsonwebtoken';
import { validateBody } from '../../middleware/validate.js';
import { SurveyResponseSchema } from './survey.dto.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';

export const surveyRouter = Router();



/**
 * Helper to verify and decode CSAT JWT tokens (HS256)
 */
function verifySurveyToken(token: string) {
  const secret = process.env.CSAT_TOKEN_SECRET;
  if (!secret) {
    logger.error('CSAT_TOKEN_SECRET is not configured');
    throw new Error('Server configuration error');
  }

  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] }) as { caseId: string; exp: number };
    return payload;
  } catch (err: any) {
    throw new BadRequestError('Invalid or expired survey token');
  }
}

// ── GET /survey/:token ────────────────────────────────────────────────────────
// Public endpoint. Check if token is valid and not already submitted
surveyRouter.get('/:token', async (req, res) => {
  const { token } = req.params;

  // 1. Verify token
  let payload;
  try {
    payload = verifySurveyToken(token);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Invalid token' });
    return;
  }

  // 2. Check for idempotency (already submitted)
  const existing = await prismaRead.csatResponse.findUnique({
    where: { token },
  });

  if (existing?.submittedAt) {
    res.json({ valid: true, caseId: payload.caseId, alreadySubmitted: true });
    return;
  }

  res.json({ valid: true, caseId: payload.caseId, alreadySubmitted: false });
});

// ── POST /survey/respond ──────────────────────────────────────────────────────
// Public endpoint. Submit survey response.
surveyRouter.post('/respond', validateBody(SurveyResponseSchema), async (req, res) => {
  const { token, score, feedback } = req.body;

  // 1. Verify token structure
  const payload = verifySurveyToken(token);

  // 2. Check idempotency and ensure record exists
  const existing = await prismaRead.csatResponse.findUnique({
    where: { token },
  });

  if (!existing) {
    throw new NotFoundError('Survey record not found or expired');
  }

  if (existing.submittedAt) {
    res.json({ success: true, alreadySubmitted: true });
    return;
  }

  // 4. Save response securely by updating the existing record
  await prismaWrite.csatResponse.update({
    where: { token },
    data: {
      score,
      feedback,
      submittedAt: new Date(),
    },
  });

  logger.info({ caseId: payload.caseId, score }, 'CSAT response recorded');
  res.json({ success: true, alreadySubmitted: false });
});
