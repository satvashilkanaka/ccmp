import { z } from 'zod';

export const SurveyResponseSchema = z.object({
  token: z.string().min(1),
  score: z.number().int().min(1).max(5),
  feedback: z.string().max(4000).optional(),
});
