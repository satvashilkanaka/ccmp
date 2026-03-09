import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { adminService } from './admin.service.js';
import { processDailySummary } from '../../cron/daily-summary.js';
import {
  CreateUserSchema,
  UpdateUserSchema,
  CreateSlaPolicySchema,
  UpdateSlaPolicySchema,
  CreateRoutingRuleSchema,
  UpdateRoutingRuleSchema,
  ReorderRoutingRulesSchema,
  DryRunRoutingRuleSchema,
} from './admin.dto.js';

export const adminRouter = Router();

const ADMIN_ONLY = requireRole(['ADMIN']);
const ADMIN_OR_SUPERVISOR = requireRole(['ADMIN', 'SUPERVISOR']);

// ── Routing Rules ──────────────────────────────────────────────────────────

adminRouter.get('/routing-rules', ADMIN_OR_SUPERVISOR, async (req: Request, res: Response) => {
  const rules = await adminService.listRoutingRules();
  res.json(rules);
});

adminRouter.post('/routing-rules', ADMIN_ONLY, validateBody(CreateRoutingRuleSchema), async (req: Request, res: Response) => {
  const rule = await adminService.createRoutingRule(req.body);
  res.status(201).json(rule);
});

adminRouter.patch('/routing-rules/:id', ADMIN_ONLY, validateBody(UpdateRoutingRuleSchema), async (req: Request, res: Response) => {
  const rule = await adminService.updateRoutingRule(req.params.id, req.body);
  res.json(rule);
});

adminRouter.delete('/routing-rules/:id', ADMIN_ONLY, async (req: Request, res: Response) => {
  await adminService.deleteRoutingRule(req.params.id);
  res.status(204).end();
});

adminRouter.post('/routing-rules/reorder', ADMIN_ONLY, validateBody(ReorderRoutingRulesSchema), async (req: Request, res: Response) => {
  await adminService.reorderRoutingRules(req.body.ruleIds);
  res.status(200).json({ success: true });
});

adminRouter.post('/routing-rules/dry-run', ADMIN_OR_SUPERVISOR, validateBody(DryRunRoutingRuleSchema), async (req: Request, res: Response) => {
  const result = await adminService.dryRunRoutingRules(req.body);
  res.json(result);
});

// ── SLA Policies ──────────────────────────────────────────────────────────────

adminRouter.get('/sla-policies', ADMIN_ONLY, async (req: Request, res: Response) => {
  const policies = await adminService.listSlaPolicies();
  res.json(policies);
});

adminRouter.post('/sla-policies', ADMIN_ONLY, validateBody(CreateSlaPolicySchema), async (req: Request, res: Response) => {
  const policy = await adminService.createSlaPolicy(req.body);
  res.status(201).json(policy);
});

adminRouter.patch('/sla-policies/:id', ADMIN_ONLY, validateBody(UpdateSlaPolicySchema), async (req: Request, res: Response) => {
  const policy = await adminService.updateSlaPolicy(req.params.id, req.body);
  res.json(policy);
});

// ── User Management ───────────────────────────────────────────────────────────

adminRouter.get('/users', ADMIN_ONLY, async (req: Request, res: Response) => {
  const users = await adminService.listUsers();
  res.json({ items: users });
});

adminRouter.post('/users', ADMIN_ONLY, validateBody(CreateUserSchema), async (req: Request, res: Response) => {
  const user = await adminService.createUser(req.body);
  res.status(201).json(user);
});

adminRouter.patch('/users/:id', ADMIN_ONLY, validateBody(UpdateUserSchema), async (req: Request, res: Response) => {
  const user = await adminService.updateUser(req.params.id, req.body);
  res.json(user);
});

adminRouter.delete('/users/:id', ADMIN_ONLY, async (req: Request, res: Response) => {
  const user = await adminService.deactivateUser(req.params.id);
  res.json(user);
});

// ── System Health ─────────────────────────────────────────────────────────────

adminRouter.get('/health', ADMIN_ONLY, async (req: Request, res: Response) => {
  const health = await adminService.getSystemHealth();
  res.json(health);
});

// ── Cron Triggers ─────────────────────────────────────────────────────────────

adminRouter.post('/cron/daily-summary', ADMIN_ONLY, async (req: Request, res: Response) => {
  const result = await processDailySummary();
  res.json(result);
});
