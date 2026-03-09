const http = require('http');

async function disableActions() {
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

  const actionsToDisable = ['CONFIGURE_TOTP', 'VERIFY_EMAIL', 'UPDATE_PROFILE', 'UPDATE_PASSWORD'];

  for (const action of actionsToDisable) {
      const actionRes = await fetch(`http://localhost:8180/admin/realms/ccmp/authentication/required-actions/${action}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (actionRes.ok) {
        const actionObj = await actionRes.json();
        actionObj.enabled = false;
        actionObj.defaultAction = false;
        
        await fetch(`http://localhost:8180/admin/realms/ccmp/authentication/required-actions/${action}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(actionObj)
        });
        console.log(`Disabled ${action} at realm level.`);
      }
  }

  // Remove actions from specific users
  const usersRes = await fetch('http://localhost:8180/admin/realms/ccmp/users', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const users = await usersRes.json();
  
  for (const user of users) {
    if (user.requiredActions && user.requiredActions.length > 0) {
      user.requiredActions = []; // Clear all required actions!
      
      const updateRes = await fetch(`http://localhost:8180/admin/realms/ccmp/users/${user.id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(user)
      });
      
      if (updateRes.ok) {
         console.log(`Cleared all required actions from user ${user.username}`);
      } else {
         console.error(`Failed to update user ${user.username}`);
      }
    }
  }
}

disableActions().catch(console.error);
