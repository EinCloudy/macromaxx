import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCREENSAVERS, SCREENSAVER_GRAPHICS_PRESETS, screensaverFrame, screensaverSettings, screensaverBudget } from '../shared/screensaver.js';
import { ScreensaverRenderer } from '../electron/screensaver-renderer.js';
import { initialState, validateState } from '../shared/model.js';
import { Devices } from '../electron/devices.js';
import sharp from 'sharp';
import { visualSignature } from '../shared/visuals.js';

test('twelve distinct screensavers produce animated RGB frames', () => {
  const frames = new Set();
  assert.equal(SCREENSAVERS.length, 12);
  for (const { id } of SCREENSAVERS) {
    const first = screensaverFrame(id, 240, 144, 0);
    const second = screensaverFrame(id, 240, 144, 2);
    assert.equal(first.length, 240 * 144 * 3);
    assert.ok(first.some((value) => value > 0), id);
    assert.notDeepEqual(first, second, id);
    frames.add(Buffer.from(first).toString('base64'));
  }
  assert.equal(frames.size, SCREENSAVERS.length);
});

test('screensaver settings are optional for old workspaces and validated for imports', () => {
  const state = initialState();
  assert.equal(screensaverSettings(state.settings).enabled, false);
  delete state.settings.screensaver;
  assert.equal(validateState(state), state);
  for (const invalid of [null, { enabled: true, effect: 'unknown', timeout: 30 },
    { enabled: true, effect: 'matrix', timeout: 0 },
    { enabled: true, effect: 'matrix', timeout: 86401 },
    { enabled: 'yes', effect: 'matrix', timeout: 30 }]) {
    state.settings.screensaver = invalid;
    assert.throws(() => validateState(state), /screensaver/);
  }
});

test('Eco is the legacy default and large decks have bounded frame budgets', () => {
  assert.equal(screensaverSettings({}).performance, 'eco');
  assert.equal(screensaverBudget({}, 15).fps, 5);
  assert.ok(screensaverBudget({}, 32).fps * 32 <= 100);
  assert.ok(screensaverBudget({}, 128).fps <= 2);
  assert.equal(screensaverBudget({ screensaver: { performance: 'smooth' } }).fps, 10);
  const state = initialState();
  state.settings.screensaver.performance = 'invalid';
  assert.throws(() => validateState(state), /screensaver/);
  for (const performance of ['eco', 'smooth', undefined]) {
    state.settings.screensaver.performance = performance;
    assert.equal(validateState(state), state);
  }
});

test('all graphics presets persist with increasing detail and bounded XL frame rates', () => {
  const state = initialState();
  let lastTile = 0, lastFps = 0;
  for (const preset of SCREENSAVER_GRAPHICS_PRESETS) {
    state.settings.screensaver.performance = preset.id;
    const restored = validateState(JSON.parse(JSON.stringify(state)));
    assert.equal(screensaverSettings(restored.settings).performance, preset.id);
    const budget = screensaverBudget(restored.settings, 32);
    assert.equal(budget.tile, preset.tile);
    assert.ok(budget.tile > lastTile);
    assert.ok(budget.fps > lastFps);
    assert.ok(budget.fps <= preset.fps);
    assert.ok(budget.fps * 32 <= preset.updates);
    lastTile = budget.tile; lastFps = budget.fps;
  }
  state.settings.screensaver.performance = 'smooth';
  assert.equal(screensaverSettings(validateState(state).settings).performance, 'balanced');
  assert.deepEqual(screensaverBudget(state.settings), screensaverBudget({ screensaver: { performance: 'balanced' } }));
});

test('scene buffers are reused and cleared without stale pixels', () => {
  const buffer = new Uint8Array(120 * 72 * 3);
  assert.equal(screensaverFrame('plasma', 120, 72, 0, buffer), buffer);
  screensaverFrame('stars', 120, 72, 1, buffer);
  assert.deepEqual(buffer, screensaverFrame('stars', 120, 72, 1));
  assert.throws(() => screensaverFrame('stars', 120, 72, 0, new Uint8Array(3)), /buffer/);
});

test('tile scaling reuses two buffers and preserves the displayed source on XL layouts', () => {
  const controls = Array.from({ length: 32 }, (_, index) => ({ index, column: index % 8,
    row: Math.floor(index / 8), feedbackType: 'lcd', pixelSize: { width: 96, height: 96 } }));
  const renderer = new ScreensaverRenderer(8, 4, 24, controls);
  const scene = renderer.scene;
  renderer.draw('plasma', 0);
  const first = renderer.buffer(controls[31]);
  const snapshot = Buffer.from(first);
  assert.equal(first.length, 96 * 96 * 3);
  const lastPixel = ((4 * 24 - 1) * 8 * 24 + 8 * 24 - 1) * 3;
  assert.deepEqual([...first.subarray(-3)], [...scene.subarray(lastPixel, lastPixel + 3)]);
  renderer.draw('plasma', 1);
  const second = renderer.buffer(controls[31], first);
  assert.notEqual(first, second);
  assert.deepEqual(first, snapshot);
  assert.equal(renderer.buffer(controls[31], second), first);
  assert.equal(renderer.scene, scene);
});

function fixture() {
  const settings = { screensaver: { enabled: true, effect: 'matrix', timeout: 10 } };
  const writes = [], input = [];
  let idle = 100;
  const devices = new Devices({
    getSettings: () => settings, getIdleSeconds: () => idle,
    getKeys: () => [], getBrightness: () => 50, onStatus: () => {},
    onDown: (index) => input.push(['down', index]), onUp: (index) => input.push(['up', index]),
  });
  devices.deck = {
    setBrightness: async () => {},
    fillKeyBuffer: async (index, buffer) => writes.push({ index, buffer }),
    prepareFillKeyBuffer: async (index, buffer) => ({ index, buffer }),
    sendPreparedBuffer: async (packet) => writes.push(packet),
  };
  devices.info = { connected: true, columns: 2, rows: 1 };
  devices.controls = [0, 1].map((index) => ({ index, column: index, row: 0,
    feedbackType: 'lcd', pixelSize: { width: 72, height: 72 } }));
  return { devices, settings, writes, input, setIdle: (value) => { idle = value; } };
}

test('idle starts tiled hardware animation; normal updates cannot overwrite it', async () => {
  const { devices, writes } = fixture();
  await devices.tickScreensaver(devices.lastActivity + 9000);
  assert.equal(writes.length, 0);
  await devices.tickScreensaver(devices.lastActivity + 10000);
  assert.equal(devices.info.screensaver, 'matrix');
  assert.ok(writes.length > 2, 'entry blends over multiple frames');
  assert.equal(writes[0].buffer.length, 72 * 72 * 3);
  const count = writes.length;
  await devices.render();
  assert.equal(writes.length, count);
});

test('frame limiting skips rendering and unchanged tiles skip USB writes', async () => {
  const { devices, settings, writes } = fixture();
  settings.screensaver.effect = 'snake';
  const now = devices.lastActivity + 10000;
  await devices.tickScreensaver(now);
  const count = writes.length;
  const renderer = devices.screensaverRenderer;
  await devices.tickScreensaver(now + 50);
  assert.equal(writes.length, count);
  assert.equal(devices.screensaverRenderer, renderer);
  // The scene changes every 1/14 seconds; at this point it exactly matches
  // the entry frame, so comparison must suppress redundant LCD updates.
  devices.screensaverLastFrame = now - 1000;
  await devices.tickScreensaver(now);
  assert.equal(writes.length, count);
  settings.screensaver.performance = 'smooth';
  await devices.tickScreensaver(now + 1000);
  assert.equal(devices.screensaverRenderer.tile, 40);
});

test('Ultra renders above 10 FPS and switching back to Eco restores throttling', async () => {
  const { devices, settings, writes } = fixture();
  settings.screensaver.effect = 'plasma';
  settings.screensaver.performance = 'ultra';
  const now = devices.lastActivity + 10000;
  await devices.tickScreensaver(now);
  const count = writes.length;
  await devices.tickScreensaver(now + 49);
  assert.equal(writes.length, count);
  await devices.tickScreensaver(now + 50);
  assert.ok(writes.length > count);
  assert.equal(devices.screensaverRenderer.tile, 72);
  settings.screensaver.performance = 'eco';
  const ecoCount = writes.length;
  await devices.tickScreensaver(now + 100);
  assert.equal(writes.length, ecoCount);
  await devices.tickScreensaver(now + 250);
  assert.equal(devices.screensaverRenderer.tile, 24);
  assert.equal(devices.info.screensaver, 'plasma');
});

test('wake press and release are swallowed, subsequent presses execute normally', async () => {
  const { devices, input } = fixture();
  await devices.tickScreensaver(devices.lastActivity + 10000);
  devices.sent.set(0, 'old-artwork');
  devices.buttonDown(0); devices.buttonUp(0);
  assert.equal(devices.info.screensaver, null);
  assert.equal(devices.sent.size, 0);
  assert.deepEqual(input, []);
  devices.buttonDown(1); devices.buttonUp(1);
  assert.deepEqual(input, [['down', 1], ['up', 1]]);
  await devices.renderQueue;
});

test('computer input, held keys and disabling prevent or stop the screensaver', async () => {
  const { devices, settings, setIdle } = fixture();
  const now = devices.lastActivity + 10000;
  setIdle(0); await devices.tickScreensaver(now);
  assert.ok(!devices.info.screensaver);
  setIdle(100); devices.heldButtons.add(0);
  await devices.tickScreensaver(now); assert.ok(!devices.info.screensaver);
  devices.heldButtons.clear(); await devices.tickScreensaver(now);
  assert.equal(devices.info.screensaver, 'matrix');
  setIdle(0); await devices.tickScreensaver(now);
  assert.ok(!devices.info.screensaver);
  setIdle(100); await devices.tickScreensaver(now);
  settings.screensaver.enabled = false; await devices.tickScreensaver(now);
  assert.ok(!devices.info.screensaver);
  await devices.renderQueue;
});

test('waking restores exact cached artwork, including changes made during idle', async () => {
  const { devices, writes } = fixture();
  const key = { ...initialState().profiles[0].keys[0], fontSize: 16 };
  devices.getKeys = () => [key, key];
  const image = async (r) => 'data:image/png;base64,' + (await sharp({ create: {
    width: 1, height: 1, channels: 3, background: { r, g: 0, b: 0 },
  } }).png().toBuffer()).toString('base64');
  await devices.setImages([{ signature: visualSignature(key), image: await image(70) }]);
  await devices.tickScreensaver(devices.lastActivity + 10000);
  key.label = 'Changed while idle';
  await devices.setImages([{ signature: visualSignature(key), image: await image(190) }]);
  const wakeStart = writes.length;
  devices.buttonDown(0); devices.buttonUp(0);
  await devices.renderQueue;
  assert.ok(writes.length - wakeStart > 2, 'exit blends over multiple frames');
  assert.ok(writes.slice(wakeStart, -2).some(({ buffer }) => buffer[0] > 0 && buffer[0] < 190),
    'intermediate frames mix the screensaver with the latest artwork');
  assert.equal(writes.at(-1).buffer[0], 190);
  assert.equal(writes.at(-2).buffer[0], 190);
});

test('waking during entry cancels further entry frames and preserves the visible source', async () => {
  const { devices, writes, input } = fixture();
  let visible;
  devices.deck.sendPreparedBuffer = async (packet) => {
    writes.push(packet);
    visible = packet.buffer;
    devices.buttonDown(0); devices.buttonUp(0);
  };
  await devices.tickScreensaver(devices.lastActivity + 10000);
  await devices.renderQueue;
  assert.equal(writes.length, 1, 'no more screensaver frames after the wake press');
  assert.equal(devices.info.screensaver, null);
  assert.equal(devices.displayed.get(writes[0].index), visible);
  assert.deepEqual(input, []);
  assert.equal(devices.pendingTransition.kind, 'screensaver', 'exit waits for exact key artwork');
});
