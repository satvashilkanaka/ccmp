const http = require('http');

async function check() {
  const tokenRes = await fetch('http://localhost:8180/realms/master/protocol/openid-connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'client_id=admin-cli&username=admin&password=admin_password123&grant_type=password'
  });
  const tokenData = await tokenRes.json();
  const token = tokenData.access_token;

  const usersRes = await fetch('http://localhost:8180/admin/realms/ccmp/users?username=supervisor1', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const user = (await usersRes.json())[0];

  const rolesRes = await fetch(`http://localhost:8180/admin/realms/ccmp/users/${user.id}/role-mappings/realm`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const roles = await rolesRes.json();
  console.log('Roles for supervisor1:', roles.map(r => r.name));
}

check().catch(console.error);
