import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../app';
import { CaseService } from '../modules/cases/case.service';
import { authenticate } from '../middleware/auth';
import { ConflictError } from '../lib/errors';

// Setup Express App
const app = buildApp();

// Mock Auth Middleware
vi.mock('../middleware/auth', () => ({
  authenticate: vi.fn((req, res, next) => {
    // We will control authentication status by modifying the spy mock later
    next();
  }),
  requireRole: vi.fn(() => (req: any, res: any, next: any) => next())
}));

// Mock CaseService entirely to isolate the router, zod, and controllers.
vi.mock('../modules/cases/case.service');

// Mock Database exports manually to prevent importing the actual Meilisearch client
vi.mock('@ccmp/database', () => ({
  meiliClient: {
    index: vi.fn().mockReturnValue({
      search: vi.fn().mockResolvedValue({ hits: [] })
    })
  },
  prismaWrite: {
    case: { create: vi.fn(), update: vi.fn() },
    caseEvent: { create: vi.fn() },
    caseNote: { create: vi.fn() }
  },
  prismaRead: {
    case: { findUnique: vi.fn(), findMany: vi.fn() }
  },
  CaseChannel: { PHONE: 'PHONE', EMAIL: 'EMAIL', CHAT: 'CHAT' },
  CasePriority: { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', URGENT: 'URGENT' },
  CaseStatus: { NEW: 'NEW', ASSIGNED: 'ASSIGNED', IN_PROGRESS: 'IN_PROGRESS', RESOLVED: 'RESOLVED', CLOSED: 'CLOSED' }
}));

describe('Cases Router Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/v1/cases', () => {
    it('should return 401 without auth', async () => {
      // Setup mock to simulate missing token
      vi.mocked(authenticate).mockImplementationOnce((req, res) => {
        res.status(401).json({ error: 'Unauthorized', message: 'Missing Bearer token' });
      });

      const response = await request(app)
        .post('/api/v1/cases')
        .send({ subject: 'Test' });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Unauthorized');
    });

    it('should create case with valid AGENT token + valid body → 201', async () => {
      vi.mocked(authenticate).mockImplementationOnce((req: any, res, next) => {
        req.user = { id: 'agent-1', role: 'AGENT' };
        next();
      });

      vi.mocked(CaseService.prototype.createCase).mockResolvedValueOnce({
        id: 'cuid-1',
        caseNumber: 'CASE-00001',
        subject: 'Test Case',
        channel: 'EMAIL',
        priority: 'MEDIUM'
      } as any);

      const response = await request(app)
        .post('/api/v1/cases')
        .send({ subject: 'Test Case', channel: 'EMAIL', priority: 'MEDIUM' });

      expect(response.status).toBe(201);
      expect(response.body.caseNumber).toMatch(/^CASE-\d{5}$/);
    });

    it('should return 400 with fields.subject when missing subject', async () => {
      vi.mocked(authenticate).mockImplementationOnce((req: any, res, next) => {
        req.user = { id: 'agent-1', role: 'AGENT' };
        next();
      });

      const response = await request(app)
        .post('/api/v1/cases')
        .send({ channel: 'EMAIL' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.fields).toHaveProperty('subject');
    });
  });

  describe('GET /api/v1/cases', () => {
    it('returns 200 with { items, pagination } capped limit', async () => {
      vi.mocked(authenticate).mockImplementationOnce((req: any, res, next) => {
        req.user = { id: 'agent-1', role: 'AGENT' };
        next();
      });

      vi.mocked(CaseService.prototype.listCases).mockResolvedValueOnce({
        items: [{ id: 'case-xyz' } as any],
        nextCursor: undefined,
        hasMore: false
      });

      const response = await request(app)
        .get('/api/v1/cases?limit=5');

      expect(response.status).toBe(200);
      expect(response.body.items).toBeDefined();
      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.limit).toBe(5);
    });

    it('returns next page with cursor, limit=200 is capped at 100 by schema', async () => {
      vi.mocked(authenticate).mockImplementationOnce((req: any, res, next) => {
        req.user = { id: 'agent-1', role: 'AGENT' };
        next();
      });

      vi.mocked(CaseService.prototype.listCases).mockResolvedValueOnce({
        items: [{ id: 'case-abc' } as any],
        nextCursor: 'next-cursor-id',
        hasMore: true
      });

      const response = await request(app)
        .get('/api/v1/cases?limit=200&cursor=clhq3x4zq000008l412345678');

      expect(response.status).toBe(200);
      expect(response.body.pagination.limit).toBe(100); // Because zod .max(100)
    });
  });

  describe('PATCH /api/v1/cases/:id/status', () => {
    it('returns 409 when version is stale', async () => {
      vi.mocked(authenticate).mockImplementationOnce((req: any, res, next) => {
        req.user = { id: 'agent-1', role: 'AGENT' };
        next();
      });

      vi.mocked(CaseService.prototype.transitionStatus).mockRejectedValueOnce(
        new ConflictError('Case was modified by another user — please refresh')
      );

      const response = await request(app)
        .patch('/api/v1/cases/cuid-1/status')
        .send({ newStatus: 'ASSIGNED', version: 1 });

      expect(response.status).toBe(409);
      expect(response.body.error).toMatch(/modified by another user/);
    });
  });
});
