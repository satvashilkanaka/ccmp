import { Router, Request, Response } from 'express';
import { prismaRead, prismaWrite } from '@ccmp/database';
import { z } from 'zod';
import { validateBody } from '../../middleware/validate.js';

export const preferencesRouter = Router();

const UpdatePreferencesSchema = z.object({
  emailOnAssign: z.boolean().optional(),
  emailOnSlaWarning: z.boolean().optional(),
  emailOnSlaBreach: z.boolean().optional(),
  emailOnQaReview: z.boolean().optional(),
  emailDailySummary: z.boolean().optional(),
});

// GET /api/v1/notifications/preferences
preferencesRouter.get('/preferences', async (req: Request, res: Response) => {
  const userId = (req as any).user.id;

  let prefs = await prismaRead.notificationPreference.findUnique({
    where: { userId },
  });

  // Create default if not exists
  if (!prefs) {
    prefs = await prismaWrite.notificationPreference.create({
      data: { userId },
    });
  }

  res.json(prefs);
});

// PATCH /api/v1/notifications/preferences
preferencesRouter.patch('/preferences', validateBody(UpdatePreferencesSchema), async (req: Request, res: Response) => {
  const userId = (req as any).user.id;

  const prefs = await prismaWrite.notificationPreference.upsert({
    where: { userId },
    update: req.body,
    create: {
      userId,
      ...req.body,
    },
  });

  res.json(prefs);
});
