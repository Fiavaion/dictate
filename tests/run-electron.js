'use strict';
// Launch Electron with ELECTRON_RUN_AS_NODE removed, so `npm run test:renderer` works even
// when the shell inherits it (e.g. from an editor that is itself an Electron app).
// Usage: node tests/run-electron.js <script> [args...]
const { spawnSync } = require('child_process');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const cli = require.resolve('electron/cli.js'); // downloads the binary on first use (Electron >= 42)
const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], { stdio: 'inherit', env });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
