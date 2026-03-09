import http from 'k6/http';
import { check } from 'k6';

export const options = {
  scenarios: {
    burst: {
      executor: 'shared-iterations',
      vus: 200,
      iterations: 10000,
      maxDuration: '5m',
    },
  },
  thresholds: {
    'http_req_failed': [{ threshold: 'rate<0.001', abortOnFail: true }],
  },
};

function getToken() {
  const url = 'http://localhost:8180/realms/ccmp/protocol/openid-connect/token';
  const payload = {
    grant_type: 'client_credentials',
    client_id: 'ccmp-api',
    client_secret: 'change_me_later',
  };
  const res = http.post(url, payload);
  return res.json('access_token');
}

export function setup() {
  return getToken();
}

export default function (token) {
  const payload = JSON.stringify({
    subject: 'SLA Burst Testing',
    description: 'Testing background worker ingestion limits against 10k spikes',
    channel: 'EMAIL',
    priority: 'HIGH',
  });

  const res = http.post('http://localhost:4000/api/v1/cases', payload, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    tags: { endpoint: 'sla_burst' },
  });

  check(res, {
    'status is 201': (r) => r.status === 201,
  });
}
