// create-users.js
const http = require('http');

async function provisionUsers() {
  const tokenRes = await fetch('http://localhost:8180/realms/master/protocol/openid-connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'client_id=admin-cli&username=admin&password=admin_password123&grant_type=password'
  });

  const tokenData = await tokenRes.json();
  const token = tokenData.access_token;

  if (!token) {
    console.error('Failed to get token:', tokenData);
    process.exit(1);
  }

  const users = [
    { username: 'agent1', password: 'P@ssw0rd123!', role: 'AGENT', firstName: 'Alice', lastName: 'Agent' },
    { username: 'senior1', password: 'P@ssw0rd123!', role: 'SENIOR_AGENT', firstName: 'Bob', lastName: 'Senior' },
    { username: 'supervisor1', password: '  ', role: 'SUPERVISOR', firstName: 'Carol', lastName: 'Supervisor' },
    { username: 'qa1', password: 'P@ssw0rd123!', role: 'QA_ANALYST', firstName: 'Dave', lastName: 'Quality' },
    { username: 'admin1', password: 'P@ssw0rd123!', role: 'ADMIN', firstName: 'Eve', lastName: 'Admin' }
  ];

  // Get Realm roles first to ensure they exist or get their IDs
  const rolesRes = await fetch('http://localhost:8180/admin/realms/ccmp/roles', {
    headers: { Authorization: `Bearer ${token}` }
  });
  let existingRoles = await rolesRes.json();

  for (const u of users) {
    console.log(`Creating user ${u.username}...`);

    // Create user
    const createRes = await fetch('http://localhost:8180/admin/realms/ccmp/users', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: u.username,
        firstName: u.firstName,
        lastName: u.lastName,
        email: `${u.username}@example.com`,
        enabled: true,
        credentials: [{ type: 'password', value: u.password, temporary: false }]
      })
    });

    if (!createRes.ok && createRes.status !== 409) {
      console.error(`Failed to create ${u.username}:`, await createRes.text());
      continue;
    }

    // Fetch user ID
    const userRes = await fetch(`http://localhost:8180/admin/realms/ccmp/users?username=${u.username}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const currUser = (await userRes.json())[0];

    // Ensure Role Exists
    let roleDef = existingRoles.find(r => r.name === u.role);
    if (!roleDef) {
      await fetch('http://localhost:8180/admin/realms/ccmp/roles', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: u.role })
      });
      const rolesRefresh = await fetch('http://localhost:8180/admin/realms/ccmp/roles', { headers: { Authorization: `Bearer ${token}` } });
      existingRoles = await rolesRefresh.json();
      roleDef = existingRoles.find(r => r.name === u.role);
    }

    // Assign Role
    await fetch(`http://localhost:8180/admin/realms/ccmp/users/${currUser.id}/role-mappings/realm`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([roleDef])
    });

    console.log(`Assigned role ${u.role} to ${u.username}`);
  }
}

provisionUsers().catch(console.error);
