import electron from 'electron';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const worker = fileURLToPath(new URL('./verify-native-worker.js', import.meta.url));
for (const kind of ['critical', 'robot', 'audio']) {
  const result = spawnSync(electron, [worker, kind], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', timeout: 20000 });
  if (result.status === 0) process.stdout.write(result.stdout);
  else if (kind === 'critical') { process.stderr.write(result.stderr || result.error?.message || 'Critical native dependency verification failed.'); process.exit(1); }
  else console.warn(`Optional ${kind} backend unavailable in this build environment; OS/plugin fallbacks remain available. ${result.stderr || result.error?.message || ''}`);
}
