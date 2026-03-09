import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';

export const options = {
  stages: [
    { duration: '2m', target: 500 },
    { duration: '2m', target: 500 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    'http_req_duration{endpoint:case_list}': [{ threshold: 'p(95)<150', abortOnFail: true }],
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
  const tokens = [];
  for (let i = 0; i < 500; i++) {
    tokens.push(getToken());
  }
  return tokens; // Passed to default function
}

export default function (tokens) {
  // Use modulo in case VU exceeds array length
  const token = tokens[(__VU - 1) % tokens.length];
  
  const res = http.get('http://localhost:4000/api/v1/cases', {
    headers: { Authorization: `Bearer ${token}` },
    tags: { endpoint: 'case_list' },
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
  });
}
