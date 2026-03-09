import { prismaRead, prismaWrite } from '@ccmp/database';
import { RedisKeys } from '@ccmp/shared/src/redis-keys';
import { redisCache } from '../../lib/redis.js';
import { logger } from '../../lib/logger.js';
import { NotFoundError, BadRequestError } from '../../lib/errors.js';

export class AdminService {
  // ── Routing Rules ──────────────────────────────────────────────────────────

  async listRoutingRules() {
    return prismaRead.routingRule.findMany({
      orderBy: { priorityOrder: 'asc' },
    });
  }

  async createRoutingRule(data: any) {
    const rule = await prismaWrite.routingRule.create({ data });
    await this.invalidateRoutingCache();
    return rule;
  }

  async updateRoutingRule(id: string, data: any) {
    const rule = await prismaWrite.routingRule.update({ where: { id }, data });
    await this.invalidateRoutingCache();
    return rule;
  }

  async deleteRoutingRule(id: string) {
    await prismaWrite.routingRule.delete({ where: { id } });
    await this.invalidateRoutingCache();
  }

  async reorderRoutingRules(ruleIds: string[]) {
    await prismaWrite.$transaction(
      ruleIds.map((id, index) =>
        prismaWrite.routingRule.update({
          where: { id },
          data: { priorityOrder: index },
        })
      )
    );
    await this.invalidateRoutingCache();
  }

  async dryRunRoutingRules(hypotheticalCase: any) {
    const rules = await prismaRead.routingRule.findMany({
      where: { isActive: true },
      orderBy: { priorityOrder: 'asc' },
    });

    for (const rule of rules) {
      if (this.evaluateConditions(rule.conditions, hypotheticalCase)) {
        return {
          matchedRule: rule.name,
          actions: rule.actions,
          confidence: 'exact_match',
        };
      }
    }

    return { matchedRule: null, actions: null, confidence: 'no_match' };
  }

  private evaluateConditions(conditions: any, fact: any): boolean {
    // Simple equality check for now based on common patterns
    return Object.entries(conditions).every(([key, value]) => fact[key] === value);
  }

  private async invalidateRoutingCache() {
    await redisCache.del(RedisKeys.routingRules());
    await redisCache.del(RedisKeys.routingRuleHash());
    logger.info('Routing rule cache invalidated');
  }

  // ── SLA Policies ──────────────────────────────────────────────────────────────

  async listSlaPolicies() {
    return prismaRead.slaPolicy.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async createSlaPolicy(data: any) {
    return prismaWrite.slaPolicy.create({ data });
  }

  async updateSlaPolicy(id: string, data: any) {
    return prismaWrite.slaPolicy.update({ where: { id }, data });
  }

  // ── User Management ───────────────────────────────────────────────────────────

  async listUsers(options: { skip?: number; take?: number } = {}) {
    return prismaRead.user.findMany({
      where: { deletedAt: null },
      ...options,
      orderBy: { createdAt: 'desc' },
    });
  }

  async createUser(data: any) {
    return prismaWrite.user.create({ data });
  }

  async updateUser(id: string, data: any) {
    return prismaWrite.user.update({ where: { id }, data });
  }

  async deactivateUser(id: string) {
    return prismaWrite.user.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
  }

  // ── System Health ─────────────────────────────────────────────────────────────

  async getSystemHealth() {
    const startTime = Date.now();
    
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkStorage(),
    ]);

    const results = {
      database: checks[0].status === 'fulfilled' ? 'UP' : 'DOWN',
      redis: checks[1].status === 'fulfilled' ? 'UP' : 'DOWN',
      storage: checks[2].status === 'fulfilled' ? 'UP' : 'DOWN',
      uptimeSeconds: process.uptime(),
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
    };

    return results;
  }

  private async checkDatabase() {
    await prismaRead.$queryRaw`SELECT 1`;
  }

  private async checkRedis() {
    await redisCache.ping();
  }

  private async checkStorage() {
    // Basic connectivity check or placeholder
    return true;
  }
}

export const adminService = new AdminService();
