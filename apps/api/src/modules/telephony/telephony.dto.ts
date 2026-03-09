import { z } from 'zod';

export const TelephonyActionSchema = z.object({
  callUuid: z.string().uuid(),
});
