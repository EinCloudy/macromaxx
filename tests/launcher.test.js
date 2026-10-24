import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { Launcher, argumentsArray, desktopCommand } from '../electron/launcher.js';
test('Desktop command quoting and field codes preserve argument boundaries without evaluating shell text', () => {
  assert.deepEqual(desktopCommand({ Exec: '"/opt/My App/run" --name %c %i %U %% "$HOME;echo bad"', Name: 'My App', Icon: 'app', file: '/a.desktop' }), ['/opt/My App/run', '--name', 'My App', '--icon', 'app', '%', '$HOME;echo bad']);
  assert.throws(() => argumentsArray('{"not":"an array"}'), /JSON array/);
});
test('Application launch passes JSON arguments, cwd and environment as separate spawn options', async () => {
  let captured;
  const launcher = new Launcher(() => {}, (...args) => { captured = args; const child = new EventEmitter(); child.unref = () => {}; queueMicrotask(() => child.emit('spawn')); return child; });
  await launcher.launch({ path: 'code', args: '["a b",";echo nope"]', cwd: os.tmpdir(), env: '{"MACRO_TEST":"yes"}' }, {});
  assert.deepEqual(captured.slice(0, 2), ['code', ['a b', ';echo nope']]);
  assert.equal(captured[2].cwd, os.tmpdir()); assert.equal(captured[2].env.MACRO_TEST, 'yes');
});
test('Scripts receive positional arguments and report stdout and nonzero exit status', async () => {
  const launcher = new Launcher(() => {});
  assert.equal((await launcher.script({ script: 'printf "%s" "$1"', args: '["hello world"]' }, new AbortController().signal)).message, 'hello world');
  await assert.rejects(launcher.script({ script: 'printf failure >&2; exit 7' }, new AbortController().signal), /exited 7: failure/);
});
test('Application search honors hidden user overrides of system entries', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'macro-apps-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const user = path.join(dir, 'user'), system = path.join(dir, 'system'); await fs.mkdir(user); await fs.mkdir(system);
  await fs.writeFile(path.join(system, 'demo.desktop'), '[Desktop Entry]\nType=Application\nName=Demo\nExec=demo %U\n');
  await fs.writeFile(path.join(user, 'demo.desktop'), '[Desktop Entry]\nHidden=true\n');
  const launcher = new Launcher(() => {}); assert.deepEqual(await launcher.scan([user, system]), []);
});
