import 'express-async-errors';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { surveyRouter } from '../modules/csat/survey.router';
import jwt from 'jsonwebtoken';

vi.mock('@ccmp/database', () => ({
  prismaRead: {
    csatResponse: { findUnique: vi.fn() },
    case: { findUnique: vi.fn() },
  },
  prismaWrite: {
    csatResponse: { 
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { prismaRead, prismaWrite } from '@ccmp/database';

describe('Survey Router (CSAT)', () => {
  let app: express.Application;
  const SECRET = 'test-secret';
  let validToken: string;
  let expiredToken: string;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CSAT_TOKEN_SECRET = SECRET;
    
    app = express();
    app.use(express.json());
    app.use('/survey', surveyRouter);
    // Add simple error handler
    app.use((err: any, req: any, res: any, next: any) => {
      res.status(err.statusCode || 400).json({ error: err.message });
    });

    validToken = jwt.sign({ caseId: 'case-1' }, SECRET, { expiresIn: '7d' });
    // Sign an expired token manually
    expiredToken = jwt.sign({ caseId: 'case-1', exp: Math.floor(Date.now() / 1000) - 3600 }, SECRET);
  });

  describe('GET /survey/:token', () => {
    it('should return valid=false for expired token', async () => {
      const res = await request(app).get(`/survey/${expiredToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('expire');
    });

    it('should return alreadySubmitted=true if record exists and is submitted', async () => {
      vi.mocked(prismaRead.csatResponse.findUnique).mockResolvedValue({ id: 'resp-1', submittedAt: new Date() } as any);

      const res = await request(app).get(`/survey/${validToken}`);
      expect(res.status).toBe(200);
      expect(res.body.alreadySubmitted).toBe(true);
      expect(res.body.valid).toBe(true);
    });

    it('should return alreadySubmitted=false if record does not exist', async () => {
      vi.mocked(prismaRead.csatResponse.findUnique).mockResolvedValue(null);

      const res = await request(app).get(`/survey/${validToken}`);
      expect(res.status).toBe(200);
      expect(res.body.alreadySubmitted).toBe(false);
      expect(res.body.valid).toBe(true);
    });
  });

  describe('POST /survey/respond', () => {
    it('should fail with validation error for missing score', async () => {
      const res = await request(app).post('/survey/respond').send({ token: validToken });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Validation');
    });

    it('should return alreadySubmitted=true for idempotency if already submitted', async () => {
      vi.mocked(prismaRead.csatResponse.findUnique).mockResolvedValue({ id: 'resp-1', submittedAt: new Date() } as any);

      const res = await request(app).post('/survey/respond').send({ token: validToken, score: 5 });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.alreadySubmitted).toBe(true);
    });

    it('should update csatResponse securely if record exists', async () => {
      vi.mocked(prismaRead.csatResponse.findUnique).mockResolvedValue({ id: 'resp-1', submittedAt: null } as any);
      vi.mocked(prismaWrite.csatResponse.update).mockResolvedValue({ id: 'updated-resp' } as any);

      const res = await request(app).post('/survey/respond').send({
        token: validToken,
        score: 4,
        feedback: 'Good service',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(prismaWrite.csatResponse.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { token: validToken },
          data: expect.objectContaining({ score: 4, feedback: 'Good service' }),
        })
      );
    });

    it('should throw NotFound if record does not exist', async () => {
      vi.mocked(prismaRead.csatResponse.findUnique).mockResolvedValue(null);

      const res = await request(app).post('/survey/respond').send({ token: validToken, score: 5 });
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Survey record not found');
    });
  });
});
