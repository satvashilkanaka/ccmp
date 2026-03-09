import { Router } from 'express';
import { requireRole } from '../../middleware/auth';
import { reportsService, ReportType } from './reports.service';

export const reportsRouter = Router();

// Validate query dates
const parseDates = (req: any) => {
  const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
  const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
  return { startDate, endDate };
};

const validTypes = new Set([
  'agent_performance',
  'sla_breach_rate',
  'volume_by_channel',
  'volume_by_priority',
  'resolution_time',
  'csat_scores',
  'queue_backlog'
]);

// ── GET /reports/export ───────────────────────────────────────────────────────
// Uses the csv-stringify pipeline configured natively.
reportsRouter.get(
  '/export',
  requireRole(['SUPERVISOR', 'OPERATIONS_MANAGER', 'ADMIN']),
  async (req, res) => {
    const type = req.query.type as string;
    const format = req.query.format as string;

    if (!validTypes.has(type)) {
      res.status(400).json({ error: 'Invalid report type' });
      return;
    }

    if (format !== 'csv') {
      res.status(400).json({ error: 'Format must be csv' });
      return;
    }

    const { startDate, endDate } = parseDates(req);
    await reportsService.streamCsvExport(type as ReportType, res, startDate, endDate);
  }
);

// ── GET /reports/:type ────────────────────────────────────────────────────────
// Responds dynamically with the aggregated JSON array for dashboard charts.
reportsRouter.get(
  '/:type',
  requireRole(['SUPERVISOR', 'OPERATIONS_MANAGER', 'ADMIN']),
  async (req, res) => {
    const type = req.params.type as string;

    if (!validTypes.has(type)) {
      res.status(400).json({ error: 'Invalid report type' });
      return;
    }

    const { startDate, endDate } = parseDates(req);
    const data = await reportsService.getReportData(type as ReportType, startDate, endDate);
    res.json(data);
  }
);
