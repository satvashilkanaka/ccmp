const http = require('http');

async function clearSessions() {
  const tokenRes = await fetch('http://localhost:8180/realms/master/protocol/openid-connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'client_id=admin-cli&username=admin&password=admin_password123&grant_type=password'
  });
  
  const tokenData = await tokenRes.json();
  const token = tokenData.access_token;

  if (!token) {
    console.error('Failed to get master token:', tokenData);
    process.exit(1);
  }

  const logoutRes = await fetch('http://localhost:8180/admin/realms/ccmp/logout-all', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (logoutRes.ok) {
    console.log('Successfully terminated ALL active sessions in the CCMP realm.');
  } else {
    console.error('Failed to clear sessions:', await logoutRes.text());
  }
}

clearSessions().catch(console.error);
