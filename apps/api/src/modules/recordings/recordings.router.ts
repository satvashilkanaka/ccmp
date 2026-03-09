import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { recordingService } from './recording.service.js';
import { logger } from '../../lib/logger.js';

export const recordingsRouter = Router();

/**
 * GET /api/v1/recordings/:id/playback-url
 * Role-gated: QA_ANALYST, SUPERVISOR, ADMIN only.
 * Returns a 15-minute presigned URL for audio playback.
 */
recordingsRouter.get(
  '/:id/playback-url',
  authenticate,
  requireRole(['QA_ANALYST', 'SUPERVISOR', 'ADMIN']),
  async (req: any, res) => {
    const { id } = req.params;
    const requestorId: string = req.user?.id;
    const requestorRole: string = req.user?.role;

    try {
      const url = await recordingService.generatePlaybackUrl(id, requestorId, requestorRole);
      return res.json({ url, expiresIn: 900 });
    } catch (err: any) {
      // ForbiddenError and NotFoundError are handled by the global error handler via AppError
      if (err.statusCode === 403 || err.statusCode === 404) throw err;
      logger.error({ err, recordingId: id }, 'Failed to generate playback URL');
      // Circuit breaker open → 503
      if (err.code === 'EOPENBREAKER') {
        return res.status(503).json({ error: 'Storage service temporarily unavailable' });
      }
      throw err;
    }
  },
);
