const { execSync, exec } = require('child_process');
const fs = require('fs');

exec('npx vitest run cases.router.test.ts', { env: { ...process.env, NODE_OPTIONS: '--unhandled-rejections=warn' } }, (err, stdout, stderr) => {
  fs.writeFileSync('out.log', stdout);
  fs.writeFileSync('err.log', stderr);
});
