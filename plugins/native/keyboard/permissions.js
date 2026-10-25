import fs from 'node:fs/promises';
import path from 'node:path';
export async function readPermission(file) {
  if (!file) return null;
  try { const value = JSON.parse(await fs.readFile(file, 'utf8')); return typeof value.token === 'string' && value.token ? value.token : null; }
  catch (error) { if (error.code === 'ENOENT' || error instanceof SyntaxError) return null; throw error; }
}
export async function writePermission(file, token) {
  if (!file || !token) return;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file + '.tmp', JSON.stringify({ token }), { mode: 0o600 });
  await fs.rename(file + '.tmp', file);
}
export async function forgetPermission(file) { if (file) await fs.unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
