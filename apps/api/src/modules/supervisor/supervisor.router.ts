import { Router, Request, Response } from 'express';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { supervisorService } from './supervisor.service.js';
import { z } from 'zod';
import { validateBody } from '../../middleware/validate.js';

export const supervisorRouter = Router();

// All supervisor routes require elevated roles
supervisorRouter.use(authenticate);
supervisorRouter.use(requireRole(['SUPERVISOR', 'OPERATIONS_MANAGER', 'ADMIN']));

const ReassignSchema = z.object({
  agentId: z.string().min(1),
  version: z.number().int().min(1),
});

const EscalateSchema = z.object({
  version: z.number().int().min(1),
});

const SlaOverrideSchema = z.object({
  newSlaTarget: z.string().datetime(), // ISO string
});

supervisorRouter.get('/queues', async (req: Request, res: Response) => {
  const data = await supervisorService.getLiveQueueData();
  res.json(data);
});

supervisorRouter.post('/cases/:id/reassign', validateBody(ReassignSchema), async (req: Request, res: Response) => {
  const result = await supervisorService.reassignCase(req.params.id, req.body.agentId, req.user!.id, req.body.version);
  res.json(result);
});

supervisorRouter.post('/cases/:id/escalate', validateBody(EscalateSchema), async (req: Request, res: Response) => {
  const result = await supervisorService.forceEscalate(req.params.id, req.user!.id, req.body.version);
  res.json(result);
});

supervisorRouter.post('/cases/:id/sla-override', validateBody(SlaOverrideSchema), async (req: Request, res: Response) => {
  const newTarget = new Date(req.body.newSlaTarget);
  const result = await supervisorService.overrideSla(req.params.id, newTarget, req.user!.id);
  res.json(result);
});

supervisorRouter.get('/sla/heatmap', async (req: Request, res: Response) => {
  const data = await supervisorService.getSlaHeatmap();
  res.json(data);
});
