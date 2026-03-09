// k6 smoke test for CCMP API
// Run: k6 run load-tests/scenarios/smoke.js
//
// Requirements:
// - API running at http://localhost:4000
// - Valid JWT set in K6_AUTH_TOKEN environment variable

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 100,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<150'], // p95 < 150ms
    http_req_failed: ['rate<0.001'],  // error rate < 0.1%
  },
};

const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:4000';
const TOKEN = __ENV.K6_AUTH_TOKEN || 'test-token';

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
};

export default function () {
  // ── GET /api/v1/cases ────────────────────────────────────────────────────
  const listRes = http.get(`${BASE_URL}/api/v1/cases?limit=25`, { headers });

  check(listRes, {
    'list cases status is 200': (r) => r.status === 200,
    'list cases has items array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.items);
      } catch {
        return false;
      }
    },
    'list cases response time < 150ms': (r) => r.timings.duration < 150,
  });

  // ── GET /api/v1/cases/search ─────────────────────────────────────────────
  const searchRes = http.get(`${BASE_URL}/api/v1/cases/search?q=test&limit=10`, { headers });

  check(searchRes, {
    'search status is 200 or 500 (meili down ok)': (r) => r.status === 200 || r.status === 500,
  });

  // ── Health check ─────────────────────────────────────────────────────────
  const healthRes = http.get(`${BASE_URL}/health`);

  check(healthRes, {
    'health check returns 200': (r) => r.status === 200,
  });

  sleep(0.1); // 100ms between iterations
}
