import { Request, Response, NextFunction } from 'express';
import client from 'prom-client';

// 1. Initialize Registry
export const register = new client.Registry();

// Fallback to collect default metrics (optional but good for Node.js stats)
client.collectDefaultMetrics({ register });

// 2. Define Metrics
// ccmp_http_request_duration_seconds (histogram)
export const httpRequestDurationSeconds = new client.Histogram({
  name: 'ccmp_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register],
});

// ccmp_cases_created_total (counter)
export const casesCreatedTotal = new client.Counter({
  name: 'ccmp_cases_created_total',
  help: 'Total number of cases created',
  labelNames: ['channel', 'priority'],
  registers: [register],
});

// ccmp_sla_breaches_total (counter)
export const slaBreachesTotal = new client.Counter({
  name: 'ccmp_sla_breaches_total',
  help: 'Total number of SLA breaches occurred',
  labelNames: ['priority'],
  registers: [register],
});

// ccmp_active_agents_gauge (gauge)
export const activeAgentsGauge = new client.Gauge({
  name: 'ccmp_active_agents_gauge',
  help: 'Number of currently active agents (websocket connections)',
  registers: [register],
});

// ccmp_queue_depth_gauge (gauge)
export const queueDepthGauge = new client.Gauge({
  name: 'ccmp_queue_depth_gauge',
  help: 'Number of cases currently in queue',
  labelNames: ['queue_id'],
  registers: [register],
});

// ccmp_bullmq_queue_length (gauge)
export const bullmqQueueLength = new client.Gauge({
  name: 'ccmp_bullmq_queue_length',
  help: 'Number of jobs currently in BullMQ queues',
  labelNames: ['queue_name'],
  registers: [register],
});

// ccmp_http_request_errors_total (counter — incremented in global error handler for 5xx)
export const httpRequestErrorsTotal = new client.Counter({
  name: 'ccmp_http_request_errors_total',
  help: 'Total number of HTTP 5xx errors returned by the API',
  labelNames: ['method', 'path'],
  registers: [register],
});

// 3. Express Middleware for automatic HTTP tracking
export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  // Ignore the metrics route itself to prevent infinite loop / noise
  if (req.path === '/metrics') {
    return next();
  }

  const end = httpRequestDurationSeconds.startTimer();
  
  // Hook into response finish event
  res.on('finish', () => {
    // We use req.route?.path as the bounded route if available (prevents cardinality explosion on dynamic UUIDs)
    let route = req.route ? req.route.path : req.path;
    // Basic scrubbing of IDs from unmapped routes to prevent cardinality explosion
    if (!req.route) {
      route = route.replace(/[0-9a-fA-F-]{36}/g, ':id');
    }

    end({ method: req.method, route, status_code: res.statusCode });
  });

  next();
}
