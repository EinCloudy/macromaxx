import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readPermission, writePermission, forgetPermission } from '../plugins/native/keyboard/permissions.js';
import { Input } from '../plugins/native/keyboard/service.js';

test('Portal restore tokens rotate privately and can be forgotten', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'macro-permission-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'permission.json'); assert.equal(await readPermission(file), null);
  await writePermission(file, 'old-token');
  if (process.platform !== 'win32') assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
  const input = new Input(() => {}, { tokenFile: file }); input.wayland = true;
  input.diagnostics = async () => ({ ready: input.ready });
  input.rpc = async (_, payload) => { assert.equal(payload.restoreToken, 'old-token'); return { ready: true, restoreToken: 'new-token' }; };
  await input.restore(); assert.equal(await readPermission(file), 'new-token');
  await input.forget(); assert.equal(await readPermission(file), null);
});
test('Restoration without a token does not request keyboard access', async () => {
  const input = new Input(() => {}); input.wayland = true; input.rpc = async () => assert.fail('no permission dialog should be requested');
  await input.restore();
});

test('Closing keyboard input prevents a late permission restoration from spawning a session', async () => {
  const input = new Input(() => {}); input.wayland = true;
  await input.close(); await assert.rejects(input.setup(), /closing/);
  await input.restore(); assert.equal(input.child, undefined);
});
