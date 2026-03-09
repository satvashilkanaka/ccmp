import 'express-async-errors';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { reportsRouter } from '../modules/reports/reports.router';
import { reportsService } from '../modules/reports/reports.service';

vi.mock('../modules/reports/reports.service', () => ({
  reportsService: {
    getReportData: vi.fn(),
    streamCsvExport: vi.fn(),
  },
}));

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

describe('Reports Router', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();

    app = express();
    app.use(express.json());

    app.use('/reports', (req: any, res: any, next: any) => {
      const role = req.header('x-mock-role');
      if (role) {
        req.user = { id: 'mock-user-1', role };
      }
      next();
    }, reportsRouter);
    
    app.use((err: any, req: any, res: any, next: any) => {
      res.status(err.statusCode || 500).json({ error: err.message });
    });
  });

  describe('GET /reports/:type', () => {
    it('blocks AGENT role', async () => {
      const res = await request(app).get('/reports/agent_performance').set('x-mock-role', 'AGENT');
      expect(res.status).toBe(403);
    });

    it('returns 400 for invalid report type', async () => {
      const res = await request(app).get('/reports/invalid_type').set('x-mock-role', 'SUPERVISOR');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid report type');
    });

    it('returns json data from reportsService for SUPERVISOR', async () => {
      const mockData = [{ agentName: 'Alice', resolvedCases: 10 }];
      vi.mocked(reportsService.getReportData).mockResolvedValue(mockData);

      const res = await request(app).get('/reports/agent_performance').set('x-mock-role', 'SUPERVISOR');
      
      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockData);
      expect(reportsService.getReportData).toHaveBeenCalledWith('agent_performance', undefined, undefined);
    });
  });

  describe('GET /reports/export', () => {
    it('blocks AGENT role', async () => {
      const res = await request(app).get('/reports/export?type=agent_performance&format=csv').set('x-mock-role', 'AGENT');
      expect(res.status).toBe(403);
    });

    it('returns 400 if format is not csv', async () => {
      const res = await request(app)
        .get('/reports/export?type=agent_performance&format=json')
        .set('x-mock-role', 'ADMIN');
      expect(res.status).toBe(400);
    });

    it('returns 400 if type is invalid for export', async () => {
      const res = await request(app)
        .get('/reports/export?type=invalid_type&format=csv')
        .set('x-mock-role', 'ADMIN');
      expect(res.status).toBe(400);
    });

    it('delegates streaming strictly to reportsService without buffering response headers early', async () => {
      // We simulate streamCsvExport setting the headers to prove delegation works.
      vi.mocked(reportsService.streamCsvExport).mockImplementation(async (type, res) => {
        res.setHeader('Content-Type', 'text/csv');
        res.send('agentName,resolvedCases\nAlice,10');
      });

      const res = await request(app).get('/reports/export?type=agent_performance&format=csv').set('x-mock-role', 'SUPERVISOR');
      
      expect(res.status).toBe(200);
      expect(res.header['content-type']).toContain('text/csv');
      expect(res.text).toBe('agentName,resolvedCases\nAlice,10');
      expect(reportsService.streamCsvExport).toHaveBeenCalled();
    });
  });
});
