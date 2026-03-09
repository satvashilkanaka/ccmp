import 'express-async-errors';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { kbRouter } from '../modules/kb/kb.router';

// Mocks
vi.mock('@ccmp/database', () => ({
  prismaRead: {
    kbArticle: { findMany: vi.fn(), findUnique: vi.fn() },
  },
  prismaWrite: {
    kbArticle: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
  indexArticle: vi.fn().mockResolvedValue(undefined),
  deleteArticleIndex: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock requireRole and user object directly
vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, res: any, next: any) => next()),
  requireRole: vi.fn((roles: string[]) => {
    return (req: any, res: any, next: any) => {
      // For simplicity in router tests, if role is included, let pass
      if (req.user && roles.includes(req.user.role)) {
        return next();
      }
      res.status(403).json({ error: 'ForbiddenError' });
    };
  }),
}));

import { prismaRead, prismaWrite } from '@ccmp/database';

describe('Knowledge Base Router', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();

    app = express();
    app.use(express.json());

    // Mock authentication middleware simulation
    app.use('/kb', (req: any, res: any, next: any) => {
      // simulate what authenticate does
      const role = req.header('x-mock-role');
      if (role) {
        req.user = { id: 'mock-user-1', role };
      }
      next();
    }, kbRouter);

    app.use((err: any, req: any, res: any, next: any) => {
      res.status(err.statusCode || 500).json({ error: err.message });
    });
  });

  describe('GET /kb/search', () => {
    it('forces isPublished=true for regular AGENT', async () => {
      vi.mocked(prismaRead.kbArticle.findMany).mockResolvedValue([]);

      const res = await request(app).get('/kb/search').set('x-mock-role', 'AGENT');
      expect(res.status).toBe(200);

      expect(prismaRead.kbArticle.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isPublished: true }),
        })
      );
    });

    it('does not force isPublished=true for SUPERVISOR', async () => {
      vi.mocked(prismaRead.kbArticle.findMany).mockResolvedValue([]);

      const res = await request(app).get('/kb/search').set('x-mock-role', 'SUPERVISOR');
      expect(res.status).toBe(200);

      const findManyCall = vi.mocked(prismaRead.kbArticle.findMany).mock.calls[0][0];
      expect(findManyCall?.where).not.toHaveProperty('isPublished');
    });
  });

  describe('GET /kb/articles/:id', () => {
    it('fetches article and increments view count atomically', async () => {
      vi.mocked(prismaWrite.kbArticle.update).mockResolvedValue({ id: 'art-1', viewCount: 5 } as any);

      const res = await request(app).get('/kb/articles/art-1').set('x-mock-role', 'AGENT');
      
      expect(res.status).toBe(200);
      expect(prismaWrite.kbArticle.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'art-1', isPublished: true }),
          data: { viewCount: { increment: 1 } },
        })
      );
    });

    it('returns 404 if article not found (P2025 error)', async () => {
      const notFoundErr = new Error() as any;
      notFoundErr.code = 'P2025';
      vi.mocked(prismaWrite.kbArticle.update).mockRejectedValue(notFoundErr);

      const res = await request(app).get('/kb/articles/not-exist');
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found');
    });
  });

  describe('POST /kb/articles', () => {
    const validPayload = {
      title: 'How to reset a router',
      content: 'Here are the steps to reset a router. 1, 2, 3...',
      category: 'hardware',
    };

    it('blocks AGENT role from creating article', async () => {
      const res = await request(app).post('/kb/articles').set('x-mock-role', 'AGENT').send(validPayload);
      expect(res.status).toBe(403);
    });

    it('allows SUPERVISOR role to create article', async () => {
      vi.mocked(prismaWrite.kbArticle.create).mockResolvedValue({ id: 'new-art' } as any);

      const res = await request(app).post('/kb/articles').set('x-mock-role', 'SUPERVISOR').send(validPayload);
      expect(res.status).toBe(201);
      expect(prismaWrite.kbArticle.create).toHaveBeenCalled();
    });
  });
});
