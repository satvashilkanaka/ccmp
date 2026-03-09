import { z } from 'zod';

export const AuditExportSchema = z.object({
  resourceType: z.string().optional(),
  actorId: z.string().uuid().optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  format: z.enum(['CSV', 'JSON']).default('CSV'),
});

export type AuditExportDto = z.infer<typeof AuditExportSchema>;
