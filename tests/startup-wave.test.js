import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createWavePlan, playStartupWave } from '../electron/startup-wave.js';
import { Devices } from '../electron/devices.js';
import { makeKey } from '../shared/model.js';
import { visualSignature } from '../shared/visuals.js';

function grid(rows, columns) {
  return Array.from({ length: rows * columns }, (_, index) => ({
    index, type: 'button', feedbackType: 'lcd', row: Math.floor(index / columns), column: index % columns,
    pixelSize: { width: 2, height: 2 },
  }));
}

function peakFrame(plan, index) {
  const values = plan.frames.map(frame => frame.find(entry => entry.control.index === index).level);
  return values.indexOf(Math.max(...values));
}

test('15-key wave starts at the middle button and reaches edges and corners later', () => {
  const plan = createWavePlan(grid(3, 5));
  assert.deepEqual(plan.center, { row: 1, column: 2 });
  assert.equal(plan.frames[1].find(entry => entry.control.index === 7).level, plan.levels);
  assert.ok(peakFrame(plan, 7) < peakFrame(plan, 6));
  assert.ok(peakFrame(plan, 6) < peakFrame(plan, 0));
  for (const frame of plan.frames) {
    assert.equal(frame[0].level, frame[4].level);
    assert.equal(frame[0].level, frame[10].level);
    assert.equal(frame[0].level, frame[14].level);
  }
  assert.ok(plan.frames.at(-1).every(entry => entry.level === 0));
});

test('32-key XL wave is symmetric around the four central buttons', () => {
  const plan = createWavePlan(grid(4, 8));
  assert.deepEqual(plan.center, { row: 1.5, column: 3.5 });
  for (const frame of plan.frames) {
    const levels = frame.map(entry => entry.level);
    assert.equal(levels[11], levels[12]);
    assert.equal(levels[11], levels[19]);
    assert.equal(levels[11], levels[20]);
    assert.equal(levels[0], levels[7]);
    assert.equal(levels[0], levels[24]);
    assert.equal(levels[0], levels[31]);
  }
  assert.ok(peakFrame(plan, 11) < peakFrame(plan, 0));
});

test('Playback pre-encodes reusable packets and completes with a dark final frame', async () => {
  const controls = grid(1, 3);
  let clock = 0, preparations = 0, firstSend = true;
  const sent = [], cacheSizes = [];
  const deck = {
    prepareFillKeyBuffer: async (index, buffer) => { preparations++; return { index, buffer }; },
    sendPreparedBuffer: async packet => { sent.push(packet); cacheSizes.push(preparations); firstSend = false; },
  };
  await playStartupWave(deck, controls, { now: () => clock, wait: async ms => { clock += ms; } });
  assert.equal(firstSend, false);
  assert.ok(cacheSizes.every(size => size === preparations), 'no image encoding during playback');
  assert.ok(sent.length > preparations, 'prepared packets are reused by the outgoing wave');
  for (const control of controls) {
    const final = sent.filter(packet => packet.index === control.index).at(-1);
    assert.deepEqual([...final.buffer.subarray(0, 3)], [13, 14, 21]);
  }
  assert.ok(clock >= 1300 && clock <= 1400);
});

test('Cancellation stops USB writes; slow links skip late frames', async () => {
  const controller = new AbortController(); let writes = 0;
  const deck = {
    prepareFillKeyBuffer: async index => ({ index }),
    sendPreparedBuffer: async () => { writes++; controller.abort(); },
  };
  await playStartupWave(deck, grid(1, 3), { signal: controller.signal });
  assert.equal(writes, 1);

  let clock = 0; const levels = new Map(); let slowWrites = 0;
  await playStartupWave({
    prepareFillKeyBuffer: async (index, buffer) => ({ index, buffer }),
    sendPreparedBuffer: async packet => { clock += 100; slowWrites++; levels.set(packet.index, [...packet.buffer.subarray(0, 3)]); },
  }, grid(1, 3), { now: () => clock, wait: async ms => { clock += ms; } });
  assert.ok(clock < 1800, 'a slow device does not accumulate a frame backlog');
  assert.ok(slowWrites < 28);
  assert.ok([...levels.values()].every(color => color.join() === '13,14,21'));
});

test('Skipping startup restores the latest profile and subsequent connections do not replay it', async () => {
  const oldKey = makeKey('folder'), newKey = makeKey('hotkey'); let keys = [oldKey];
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#123456' } }).png().toBuffer();
  const images = [{ signature: visualSignature(newKey), image: 'data:image/png;base64,' + png.toString('base64') }];
  const restored = []; let animationWrites = 0, pending;
  const device = new Devices({ getKeys: () => keys, getBrightness: () => 65, onStatus: () => {} });
  device.controls = grid(1, 1);
  device.sent.set(0, visualSignature(oldKey));
  device.deck = {
    setBrightness: async () => {},
    prepareFillKeyBuffer: async () => ({}),
    sendPreparedBuffer: async () => {
      animationWrites++; keys = [newKey]; pending = device.setImages(images); device.skipStartupAnimation();
    },
    fillKeyBuffer: async (_, buffer) => restored.push([...buffer.subarray(0, 3)]),
  };
  await device.startupAnimation(); await pending;
  assert.deepEqual(restored, [[18, 52, 86]]);
  assert.equal(device.info.animating, false);
  assert.equal(device.info.error, '');
  await device.startupAnimation();
  assert.equal(animationWrites, 1);
});
