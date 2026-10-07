import { createStudioServer } from './server.mjs';
import { OpenCodeGateway } from './opencode.mjs';

const target = typeof __STUDIO_TARGET__ === 'undefined' ? null : __STUDIO_TARGET__;
if (target && (target.platform !== process.platform || target.arch !== process.arch)) {
  console.error(`This Studio package targets ${target.platform}/${target.arch}, not ${process.platform}/${process.arch}. Install the matching platform folder.`);
  process.exit(1);
}
const port = Number(process.env.OPENCHAMBER_SERVICE_PORT);
const token = process.env.OPENCHAMBER_SERVICE_TOKEN;
if (!Number.isInteger(port) || port < 1 || port > 65535 || !token) {
  console.error('Install this package through OpenChamber Extensions. The host supplies the service port and token.');
  process.exit(1);
}
const { server, jobs } = createStudioServer({ token, gateway: new OpenCodeGateway() });
server.listen(port, '127.0.0.1');
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  try { await jobs.stop(); }
  catch { console.error('Studio could not persist interruption status. History will recover it on restart.'); }
  server.closeAllConnections();
  server.close(() => process.exit(0));
}
process.once('SIGTERM', () => { void stop(); });
process.once('SIGINT', () => { void stop(); });
