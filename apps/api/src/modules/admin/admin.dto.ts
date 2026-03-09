import { z } from 'zod';
import { UserRole, CasePriority, CaseChannel } from '@ccmp/database';

// ── User Management ──────────────────────────────────────────────────────────

export const CreateUserSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.nativeEnum(UserRole),
  teamId: z.string().cuid().optional(),
});

export const UpdateUserSchema = CreateUserSchema.partial();

// ── SLA Policies ──────────────────────────────────────────────────────────────

export const CreateSlaPolicySchema = z.object({
  name: z.string().min(3),
  priority: z.nativeEnum(CasePriority),
  channel: z.nativeEnum(CaseChannel),
  responseTimeMinutes: z.number().int().positive(),
  resolutionTimeMinutes: z.number().int().positive(),
  warningThresholdPct: z.number().min(0.1).max(1.0).default(0.8),
  isActive: z.boolean().default(true),
});

export const UpdateSlaPolicySchema = CreateSlaPolicySchema.partial();

// ── Routing Rules ─────────────────────────────────────────────────────────────

export const RoutingActionSchema = z.object({
  assignToQueue: z.string().optional(),
  assignToTeam: z.string().optional(),
  assignToUser: z.string().optional(),
  setPriority: z.nativeEnum(CasePriority).optional(),
});

export const CreateRoutingRuleSchema = z.object({
  name: z.string().min(3),
  conditions: z.record(z.any()), // e.g. { priority: 'CRITICAL', channel: 'PHONE' }
  actions: RoutingActionSchema,
  priorityOrder: z.number().int().nonnegative(),
  isActive: z.boolean().default(true),
});

export const UpdateRoutingRuleSchema = CreateRoutingRuleSchema.partial();

export const ReorderRoutingRulesSchema = z.object({
  ruleIds: z.array(z.string().cuid()),
});

export const DryRunRoutingRuleSchema = z.object({}).passthrough(); // hypothetical case
