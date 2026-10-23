import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { playIconTransition, darkBuffer } from '../electron/icon-transitions.js';
import { Devices } from '../electron/devices.js';
import { initialState, makeKey, validateState } from '../shared/model.js';
import { visualSignature } from '../shared/visuals.js';
import { animationEnabled } from '../shared/animation-settings.js';

const control = index => ({ index, row: 0, column: index, type: 'button', feedbackType: 'lcd', pixelSize: { width: 8, height: 8 } });
const colorBuffer = value => Buffer.alloc(8 * 8 * 3, value);

function simulatedDeck() {
  const writes = []; let preparations = 0, clock = 0;
  return {
    writes, get preparations() { return preparations; },
    timing: { now: () => clock, wait: async ms => { clock += ms; } },
    deck: {
      prepareFillKeyBuffer: async (index, buffer) => { preparations++; return { index, buffer }; },
      sendPreparedBuffer: async packet => { writes.push(packet); },
    },
  };
}

test('Folder transition interpolates artwork, finishes exactly and reuses encoded frames', async () => {
  const fake = simulatedDeck(), cache = new Map();
  const targets = [{ control: control(0), buffer: colorBuffer(230) }];
  const sources = new Map([[0, colorBuffer(60)]]);
  await playIconTransition(fake.deck, targets, sources, { kind: 'folder', cache, ...fake.timing });
  assert.ok(fake.writes[0].buffer.some(channel => channel > 60 && channel < 230));
  assert.deepEqual(fake.writes.at(-1).buffer, targets[0].buffer);
  const preparations = fake.preparations;
  await playIconTransition(fake.deck, targets, sources, { kind: 'folder', cache, ...fake.timing });
  assert.equal(fake.preparations, preparations);
  assert.equal(cache.size, 1);
});

test('Startup icon reveal appears in the middle first and finishes all keys at full opacity', async () => {
  const fake = simulatedDeck();
  const targets = [0, 1, 2].map(index => ({ control: control(index), buffer: colorBuffer(240) }));
  await playIconTransition(fake.deck, targets, new Map(), { kind: 'reveal', ...fake.timing });
  assert.equal(fake.writes[0].index, 1);
  for (const target of targets) assert.deepEqual(fake.writes.filter(w => w.index === target.control.index).at(-1).buffer, target.buffer);
});

test('Transition cancellation halts USB writes and unchanged tiles are skipped', async () => {
  const fake = simulatedDeck(), controller = new AbortController();
  const target = { control: control(0), buffer: colorBuffer(230) };
  await playIconTransition(fake.deck, [target], new Map([[0, target.buffer]]), { kind: 'folder', ...fake.timing });
  assert.equal(fake.writes.length, 0);
  fake.writes.length = 0;
  fake.deck.sendPreparedBuffer = async packet => { fake.writes.push(packet); controller.abort(); };
  await playIconTransition(fake.deck, [target], new Map(), { kind: 'reveal', signal: controller.signal, ...fake.timing });
  assert.equal(fake.writes.length, 1);
});

test('Settings remain backwards compatible and both animation switches persist independently', () => {
  const state = initialState();
  delete state.settings.folderAnimations; delete state.settings.iconRevealAnimation;
  assert.doesNotThrow(() => validateState(state));
  assert.equal(animationEnabled(state.settings, 'folder'), true);
  assert.equal(animationEnabled(state.settings, 'reveal'), true);
  state.settings.folderAnimations = false; state.settings.iconRevealAnimation = true;
  const restored = validateState(JSON.parse(JSON.stringify(state)));
  assert.equal(animationEnabled(restored.settings, 'folder'), false);
  assert.equal(animationEnabled(restored.settings, 'reveal'), true);
  state.settings.iconRevealAnimation = 'false';
  assert.throws(() => validateState(state), /Animationseinstellung/);
});

async function artwork(key, value) {
  const png = await sharp(colorBuffer(value), { raw: { width: 8, height: 8, channels: 3 } }).png().toBuffer();
  return { signature: visualSignature(key), image: 'data:image/png;base64,' + png.toString('base64') };
}

test('Disabled folder animations write cached icons directly without any transition packets', async () => {
  const old = makeKey('folder'), next = makeKey('hotkey'); let keys = [old];
  const fake = simulatedDeck(); const direct = [];
  const device = new Devices({ getKeys: () => keys, getBrightness: () => 65, getSettings: () => ({ folderAnimations: false }), onStatus: () => {} });
  device.controls = [control(0)];
  device.deck = { ...fake.deck, setBrightness: async () => {}, fillKeyBuffer: async (_, buffer) => direct.push(buffer) };
  await device.setImages([await artwork(old, 60), await artwork(next, 230)]);
  keys = [next]; await device.navigateTransition();
  assert.equal(fake.preparations, 0);
  assert.equal(direct.length, 2);
  assert.deepEqual(direct.at(-1), colorBuffer(230));
});

test('Fast navigation cancels the old transition and leaves only the latest folder artwork', async () => {
  const old = makeKey('folder'), next = makeKey('hotkey'), latest = makeKey('url'); let keys = [old];
  const physical = new Map(); let pending, changed = false;
  const device = new Devices({ getKeys: () => keys, getBrightness: () => 65, onStatus: () => {} });
  device.controls = [control(0)];
  device.deck = {
    setBrightness: async () => {}, prepareFillKeyBuffer: async (index, buffer) => ({ index, buffer }),
    fillKeyBuffer: async (index, buffer) => physical.set(index, buffer),
    sendPreparedBuffer: async ({ index, buffer }) => {
      physical.set(index, buffer);
      if (!changed) { changed = true; keys = [latest]; pending = device.navigateTransition('out'); }
    },
  };
  await device.setImages([await artwork(old, 60), await artwork(next, 150), await artwork(latest, 230)]);
  keys = [next]; await device.navigateTransition(); await pending;
  assert.deepEqual(physical.get(0), colorBuffer(230));
  assert.equal(device.sent.get(0), visualSignature(latest));
  assert.equal(device.info.transitioning, null);
  assert.equal(device.info.error, '');
});

test('Startup wave always runs; optional reveal waits for artwork and respects its switch', async () => {
  for (const enabled of [false, true]) {
    const key = makeKey('hotkey'), stages = [], physical = new Map(); let waveWrites = 0;
    const device = new Devices({
      getKeys: () => [key], getBrightness: () => 65,
      getSettings: () => ({ folderAnimations: false, iconRevealAnimation: enabled }),
      onStatus: () => { if (device.info.transitioning) stages.push(device.info.transitioning); },
    });
    device.controls = [control(0)];
    device.deck = {
      setBrightness: async () => {}, prepareFillKeyBuffer: async (index, buffer) => ({ index, buffer }),
      sendPreparedBuffer: async ({ index, buffer }) => { if (device.info.animating) waveWrites++; physical.set(index, buffer); },
      fillKeyBuffer: async (index, buffer) => physical.set(index, buffer),
    };
    await device.startupAnimation();
    assert.ok(waveWrites > 1, 'startup wave cannot be disabled by either switch');
    assert.equal(device.pendingTransition?.kind, enabled ? 'reveal' : undefined);
    await device.setImages([await artwork(key, 230)]);
    assert.deepEqual(physical.get(0), colorBuffer(230));
    assert.equal(stages.includes('reveal'), enabled);
    assert.equal(device.pendingTransition, null);
    assert.equal(device.info.error, '');
  }
});
