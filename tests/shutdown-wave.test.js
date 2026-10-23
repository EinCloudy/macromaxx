import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWavePlan, playStartupWave } from '../electron/startup-wave.js';
import { Devices } from '../electron/devices.js';

function grid(rows, columns) {
  return Array.from({ length: rows * columns }, (_, index) => ({
    index, type: 'button', feedbackType: 'lcd', row: Math.floor(index / columns), column: index % columns,
    pixelSize: { width: 2, height: 2 },
  }));
}

test('Shutdown uses the exact reversed startup frames on both 15-key and 32-key decks', () => {
  for (const [rows, columns] of [[3, 5], [4, 8]]) {
    const controls = grid(rows, columns);
    const startup = createWavePlan(controls);
    const shutdown = createWavePlan(controls, { reverse: true });
    assert.deepEqual(shutdown.frames, [...startup.frames].reverse());
    assert.deepEqual(shutdown.center, startup.center);
    assert.ok(shutdown.frames.at(-1).every(entry => entry.level === 0));
  }
});

test('Reverse playback lights the outer keys before the middle and finishes dark', async () => {
  let clock = 0; const sent = [];
  await playStartupWave({
    prepareFillKeyBuffer: async (index, buffer) => ({ index, value: buffer[0] }),
    sendPreparedBuffer: async packet => sent.push({ ...packet, time: clock }),
  }, grid(1, 3), { reverse: true, now: () => clock, wait: async ms => { clock += ms; } });
  const peak = index => {
    const key = sent.filter(packet => packet.index === index);
    return key.find(packet => packet.value === Math.max(...key.map(item => item.value))).time;
  };
  assert.ok(peak(0) < peak(1));
  assert.equal(peak(0), peak(2));
  for (let index = 0; index < 3; index++) assert.equal(sent.filter(packet => packet.index === index).at(-1).value, 13);
});

function deviceWithDeck(extra = {}) {
  const events = [];
  const device = new Devices({ getKeys: () => [], getBrightness: () => 50, getSettings: () => ({ folderAnimations: false, iconRevealAnimation: false }), onStatus: () => {} });
  device.controls = grid(1, 3);
  device.info.connected = true;
  device.deck = {
    prepareFillKeyBuffer: async (index, buffer) => ({ index, buffer }),
    sendPreparedBuffer: async packet => { events.push(['wave', packet.index, packet.buffer[0]]); },
    fillKeyBuffer: async () => { events.push(['profile']); },
    setBrightness: async () => {},
    resetToLogo: async () => { events.push(['logo']); },
    removeAllListeners: () => {},
    close: async () => { events.push(['close']); },
    ...extra,
  };
  return { device, events };
}

test('Repeated close requests play one end wave, stop normal renders and release hardware afterwards', async () => {
  const { device, events } = deviceWithDeck();
  const closing = device.close();
  assert.equal(device.close(), closing);
  await device.render();
  await closing;
  assert.ok(events.filter(event => event[0] === 'wave').length > 3, 'end wave remains active even when optional effects are disabled');
  assert.equal(events.filter(event => event[0] === 'profile').length, 0);
  assert.deepEqual(events.slice(-2), [['logo'], ['close']]);
  assert.equal(device.info.connected, false);
  assert.equal(device.info.closing, false);
  assert.equal(device.info.error, '');
  await device.close();
  assert.equal(events.filter(event => event[0] === 'close').length, 1);
});

test('An animation write error still closes the device cleanly', async () => {
  const { device, events } = deviceWithDeck({ sendPreparedBuffer: async () => { throw new Error('USB write failed'); } });
  await device.close();
  assert.deepEqual(events, [['logo'], ['close']]);
  assert.match(device.info.error, /USB write failed/);
  assert.equal(device.info.closing, false);
});

test('Disconnecting during the end wave cancels further writes and avoids a second device close', async () => {
  const { device, events } = deviceWithDeck();
  let writes = 0;
  device.deck.sendPreparedBuffer = async () => { writes++; await device.disconnect(); };
  await device.close();
  assert.equal(writes, 1);
  assert.deepEqual(events, [['close']]);
  assert.equal(device.info.closing, false);
});

test('Unresponsive animation preparation is bounded and does not prevent device cleanup', { timeout: 6500 }, async () => {
  const { device, events } = deviceWithDeck({ prepareFillKeyBuffer: () => new Promise(() => {}) });
  const start = performance.now();
  await device.close();
  assert.ok(performance.now() - start < 5500);
  assert.deepEqual(events, [['logo'], ['close']]);
});

test('Quitting without connected hardware needs no animation', async () => {
  const device = new Devices({ onStatus: () => {} });
  await device.close();
  assert.equal(device.stopping, true);
  assert.equal(device.shutdownController, undefined);
});
