import { z } from 'zod';
import { CaseChannel, CasePriority } from '@ccmp/database';

export const CreateCaseSchema = z.object({
  subject: z.string().min(3).max(255),
  description: z.string().optional(),
  channel: z.nativeEnum(CaseChannel),
  priority: z.nativeEnum(CasePriority).default('MEDIUM'),
  customerEmail: z.string().email().optional(),
  customerPhone: z.string().optional(),
  queueId: z.string().cuid().optional(),
  metadata: z.record(z.unknown()).default({}),
});

export const UpdateStatusSchema = z.object({
  newStatus: z.enum(['NEW','ASSIGNED','IN_PROGRESS','WAITING_ON_CUSTOMER','ESCALATED','PENDING_CLOSURE','RESOLVED','CLOSED']),
  version: z.number().int().positive(),
  reason: z.string().optional(),
});

export const ListCasesQuerySchema = z.object({
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).default(25).transform(v => Math.min(v, 100)),
  status: z.enum(['NEW','ASSIGNED','IN_PROGRESS','WAITING_ON_CUSTOMER','ESCALATED','PENDING_CLOSURE','RESOLVED','CLOSED']).optional(),
  priority: z.enum(['LOW','MEDIUM','HIGH','CRITICAL']).optional(),
  channel: z.enum(['PHONE','EMAIL','CHAT','SOCIAL','WALK_IN']).optional(),
});

export const CreateCaseNoteSchema = z.object({
  content: z.string().min(1).max(10000),
  isInternal: z.boolean().default(true),
});

export type CreateCaseDto = z.infer<typeof CreateCaseSchema>;
export type UpdateStatusDto = z.infer<typeof UpdateStatusSchema>;
export type ListCasesQuery = z.infer<typeof ListCasesQuerySchema>;
export type CreateCaseNoteDto = z.infer<typeof CreateCaseNoteSchema>;
