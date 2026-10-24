import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
export async function run(command, args = [], options = {}) {
  const { stdout } = await execute(command, args, { timeout: 8000, maxBuffer: 8 * 1024 * 1024, windowsHide: true, env: { ...process.env, LC_ALL: 'C' }, ...options });
  return stdout.trim();
}
