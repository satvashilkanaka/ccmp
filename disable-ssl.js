// disable-ssl.js
const http = require('http');

async function disableSsl() {
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

  // Get current realm setting
  const realmRes = await fetch('http://localhost:8180/admin/realms/ccmp', {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  const realmObj = await realmRes.json();
  realmObj.sslRequired = 'NONE';

  const updateRes = await fetch('http://localhost:8180/admin/realms/ccmp', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(realmObj)
  });

  if (updateRes.ok) {
    console.log('Successfully set sslRequired to NONE for realm ccmp');
  } else {
    console.error('Failed to update realm:', await updateRes.text());
  }
}

disableSsl().catch(console.error);
