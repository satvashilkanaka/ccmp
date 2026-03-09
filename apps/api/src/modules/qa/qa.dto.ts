import { z } from 'zod';
import { ComplianceFlag } from '@ccmp/shared';

export const CreateQaReviewSchema = z.object({
  caseId: z.string().uuid(),
  scores: z.array(z.object({
    key: z.string(),
    score: z.number().min(0),
  })),
  complianceFlags: z.array(z.nativeEnum(ComplianceFlag)).optional(),
  coachingNotes: z.string().max(4000).optional(),
});

export const LockCaseSchema = z.object({
  caseId: z.string().uuid(),
});
