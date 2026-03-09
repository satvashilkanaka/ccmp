const http = require('http');

async function disableTotp() {
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

  // 1. Disable CONFIGURE_TOTP globally for the realm
  const actionRes = await fetch('http://localhost:8180/admin/realms/ccmp/authentication/required-actions/CONFIGURE_TOTP', {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  if (actionRes.ok) {
    const actionObj = await actionRes.json();
    actionObj.enabled = false;
    actionObj.defaultAction = false;
    
    await fetch('http://localhost:8180/admin/realms/ccmp/authentication/required-actions/CONFIGURE_TOTP', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(actionObj)
    });
    console.log('Disabled CONFIGURE_TOTP at realm level.');
  }

  // 2. Remove CONFIGURE_TOTP from specific users
  const usersRes = await fetch('http://localhost:8180/admin/realms/ccmp/users', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const users = await usersRes.json();
  
  for (const user of users) {
    if (user.requiredActions && user.requiredActions.includes('CONFIGURE_TOTP')) {
      user.requiredActions = user.requiredActions.filter(a => a !== 'CONFIGURE_TOTP');
      
      const updateRes = await fetch(`http://localhost:8180/admin/realms/ccmp/users/${user.id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(user)
      });
      
      if (updateRes.ok) {
         console.log(`Removed CONFIGURE_TOTP from user ${user.username}`);
      } else {
         console.error(`Failed to update user ${user.username}`);
      }
    }
  }
}

disableTotp().catch(console.error);
