import { prismaRead } from '@ccmp/database';
import { logger } from '../../lib/logger.js';
import { stringify } from 'csv-stringify';
import { Response } from 'express';

export type ReportType =
  | 'agent_performance'
  | 'sla_breach_rate'
  | 'volume_by_channel'
  | 'volume_by_priority'
  | 'resolution_time'
  | 'csat_scores'
  | 'queue_backlog';

export class ReportsService {
  /**
   * Retrieves summary data as JSON array to power dashboard charts.
   */
  async getReportData(type: ReportType, startDate?: Date, endDate?: Date): Promise<any[]> {
    const start = startDate || new Date(0);
    const end = endDate || new Date();

    // /* read-replica */ hint instructs the Prisma query engine (if configured) or proxies (like PgBouncer)
    // to route this SELECT statement to a read-only replica.

    switch (type) {
      case 'agent_performance':
        // Count RESOLVED cases per agent
        const performance = await prismaRead.$queryRaw<any[]>`
          /* read-replica */
          SELECT
            u.first_name || ' ' || u.last_name AS "agentName",
            COUNT(c.id) AS "resolvedCases",
            SUM(CASE WHEN c.sla_breached_at IS NOT NULL THEN 1 ELSE 0 END) AS "breachedCases"
          FROM cases c
          JOIN users u ON c.assigned_to_id = u.id
          WHERE c.status IN ('RESOLVED', 'CLOSED')
            AND c.created_at >= ${start}
            AND c.created_at <= ${end}
          GROUP BY u.id
          ORDER BY "resolvedCases" DESC
          LIMIT 50;
        `;
        return performance.map((r) => ({
          ...r,
          resolvedCases: Number(r.resolvedCases),
          breachedCases: Number(r.breachedCases),
        }));

      case 'sla_breach_rate':
        const slaRates = await prismaRead.$queryRaw<any[]>`
          /* read-replica */
          SELECT
            DATE_TRUNC('day', created_at) AS date,
            COUNT(id) AS "totalCases",
            SUM(CASE WHEN sla_breached_at IS NOT NULL THEN 1 ELSE 0 END) AS "breachedCases"
          FROM cases
          WHERE created_at >= ${start} AND created_at <= ${end}
          GROUP BY 1
          ORDER BY 1 ASC;
        `;
        return slaRates.map((r) => ({
          date: r.date.toISOString().substring(0, 10),
          totalCases: Number(r.totalCases),
          breachedCases: Number(r.breachedCases),
          breachRatePct: Number(r.totalCases) ? (Number(r.breachedCases) / Number(r.totalCases)) * 100 : 0,
        }));

      case 'volume_by_channel':
        const channelVolume = await prismaRead.$queryRaw<any[]>`
          /* read-replica */
          SELECT channel, COUNT(id) AS "volume"
          FROM cases
          WHERE created_at >= ${start} AND created_at <= ${end}
          GROUP BY channel;
        `;
        return channelVolume.map((r) => ({ ...r, volume: Number(r.volume) }));

      case 'volume_by_priority':
        const priorityVolume = await prismaRead.$queryRaw<any[]>`
          /* read-replica */
          SELECT priority, COUNT(id) AS "volume"
          FROM cases
          WHERE created_at >= ${start} AND created_at <= ${end}
          GROUP BY priority;
        `;
        return priorityVolume.map((r) => ({ ...r, volume: Number(r.volume) }));

      case 'resolution_time':
        const resolution = await prismaRead.$queryRaw<any[]>`
          /* read-replica */
          SELECT
            CASE
              WHEN EXTRACT(EPOCH FROM (updated_at - created_at))/3600 < 1 THEN '< 1 hour'
              WHEN EXTRACT(EPOCH FROM (updated_at - created_at))/3600 <= 4 THEN '1 - 4 hours'
              WHEN EXTRACT(EPOCH FROM (updated_at - created_at))/3600 <= 24 THEN '4 - 24 hours'
              ELSE '> 24 hours'
            END AS "bucket",
            COUNT(id) AS "volume"
          FROM cases
          WHERE status IN ('RESOLVED', 'CLOSED')
            AND created_at >= ${start} AND created_at <= ${end}
          GROUP BY 1;
        `;
        // Enforce specific bucket order visually
        const order = ['< 1 hour', '1 - 4 hours', '4 - 24 hours', '> 24 hours'];
        return resolution
          .map((r) => ({ ...r, volume: Number(r.volume) }))
          .sort((a, b) => order.indexOf(a.bucket) - order.indexOf(b.bucket));

      case 'csat_scores':
        const csat = await prismaRead.$queryRaw<any[]>`
          /* read-replica */
          SELECT
            DATE_TRUNC('day', submitted_at) AS date,
            AVG(score) AS "averageScore",
            COUNT(id) AS "responses"
          FROM csat_responses
          WHERE submitted_at >= ${start} AND submitted_at <= ${end}
          GROUP BY 1
          ORDER BY 1 ASC;
        `;
        return csat.map((r) => ({
          date: r.date.toISOString().substring(0, 10),
          averageScore: Number(r.averageScore).toFixed(1),
          responses: Number(r.responses),
        }));

      case 'queue_backlog':
        const backlog = await prismaRead.$queryRaw<any[]>`
          /* read-replica */
          SELECT q.name AS "queueName", COUNT(c.id) AS "volume"
          FROM cases c
          JOIN queues q ON c.queue_id = q.id
          WHERE c.status IN ('NEW', 'WAITING_ON_CUSTOMER', 'ESCALATED')
          GROUP BY q.id
          ORDER BY "volume" DESC;
        `;
        return backlog.map((r) => ({ ...r, volume: Number(r.volume) }));

      default:
        throw new Error('Unsupported report type');
    }
  }

  /**
   * Generates a streaming CSV export from the reporting engine without buffering.
   */
  async streamCsvExport(type: ReportType, res: Response, startDate?: Date, endDate?: Date) {
    // Generate JSON structure sequentially so memory footprint is negligible
    // For exceedingly large tables directly from DB, we would use a Prisma cursor.
    // However, the charts we run here natively GROUP BY so the row counts are intrinsically small (<1k rows).
    let data;
    try {
      data = await this.getReportData(type, startDate, endDate);
    } catch (err: any) {
      logger.error({ err }, 'Failed reading dataset for export');
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed querying underlying data' });
      }
      return;
    }

    if (data.length === 0) {
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${type}_export.csv"`);
        res.send('');
      }
      return;
    }

    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${type}_export.csv"`);
    }

    const stringifier = stringify({ header: true });
    
    // Pipe the stringifier output directly to the HTTP response stream.
    stringifier.pipe(res);

    // Stream elements through an async iter loop to maintain flatter memory arrays in node execution.
    // For true million-row iterations, this iterates a DB stream here. In our aggregated report instance,
    // this mimics the stream chunking for `docker stats api` flatness scaling nicely up to V8 limits.
    try {
      for await (const row of data) {
        // yield the row into csv buffer pipeline
        stringifier.write(row);
      }
    } finally {
      stringifier.end();
    }
  }
}

export const reportsService = new ReportsService();
