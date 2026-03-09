import http from 'k6/http';
import { check } from 'k6';

export const options = {
  scenarios: {
    constant_request_rate: {
      executor: 'constant-arrival-rate',
      rate: 200,
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 50,
      maxVUs: 200,
    },
  },
  thresholds: {
    'http_req_duration': [{ threshold: 'p(95)<200', abortOnFail: true }],
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
    subject: 'Load Test Case Create',
    description: 'Testing write amplification',
    channel: 'EMAIL',
    priority: 'LOW',
    metadata: {
      loadTest: true,
    }
  });

  const res = http.post('http://localhost:4000/api/v1/cases', payload, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    tags: { endpoint: 'case_create' },
  });

  check(res, {
    'status is 201': (r) => r.status === 201,
  });
}
