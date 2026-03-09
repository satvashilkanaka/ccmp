import { WebSocket } from 'k6/experimental/websockets';
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 500,
  duration: '3m',
  thresholds: {
    'ws_connecting': [{ threshold: 'p(95)<500', abortOnFail: true }],
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
  return tokens;
}

export default function (tokens) {
  const token = tokens[(__VU - 1) % tokens.length];
  
  const ws = new WebSocket('ws://localhost:4000/socket.io/?EIO=4&transport=websocket');

  ws.addEventListener('open', () => {
    ws.send(`40{"token":"${token}"}`);
    ws.send(`42["agent:join","agent-${__VU}"]`);
  });

  ws.addEventListener('message', (e) => {
    if (e.data === '2') {
       ws.send('3'); // ping pong heartbeat
    }
  });

  setTimeout(function () {
    ws.close();
  }, 175000); // 175 seconds active

  check(ws, {
    'connected': (r) => r.readyState === 1,
  });
}
