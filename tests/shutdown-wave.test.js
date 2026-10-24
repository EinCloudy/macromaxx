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

test('Shutdown reverses startup and replaces its hard centre cut with a gradual fade on 15-key and 32-key decks', () => {
  for (const [rows, columns] of [[3, 5], [4, 8]]) {
    const controls = grid(rows, columns);
    const startup = createWavePlan(controls);
    const shutdown = createWavePlan(controls, { reverse: true });
    assert.deepEqual(shutdown.frames.slice(0, startup.frames.length - 1), [...startup.frames].reverse().slice(0, -1));
    assert.deepEqual(shutdown.center, startup.center);
    assert.ok(shutdown.frames.at(-1).every(entry => entry.level === 0));
    assert.ok(shutdown.frames.at(-1).every(entry => entry.fade === 0));
    const centerIndex = rows === 3 ? 7 : 11;
    const tail = shutdown.frames.slice(-9).map(frame => frame[centerIndex].level);
    assert.ok(tail[0] > 0);
    assert.equal(tail.at(-1), 0);
    assert.ok(new Set(tail).size >= 5, 'the central key has multiple visible fade steps');
    assert.ok(tail.every((level, index) => !index || level <= tail[index - 1]));
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
  for (let index = 0; index < 3; index++) assert.equal(sent.filter(packet => packet.index === index).at(-1).value, 0);
  const centralFade = sent.filter(packet => packet.index === 1).slice(-8).map(packet => packet.value);
  assert.ok(new Set(centralFade).size >= 5);
  assert.ok(centralFade.every((value, index) => !index || value < centralFade[index - 1]));
});

test('Shutdown reuses startup packets and only prepares the additional fade frames', async () => {
  const preparedCache = new Map(), controls = grid(1, 3);
  let clock = 0, preparations = 0;
  const deck = {
    prepareFillKeyBuffer: async (index, buffer) => { preparations++; return { index, buffer }; },
    sendPreparedBuffer: async () => {},
  };
  const options = { preparedCache, now: () => clock, wait: async ms => { clock += ms; } };
  await playStartupWave(deck, controls, options);
  const before = preparations;
  await playStartupWave(deck, controls, { ...options, reverse: true });
  assert.equal(preparations - before, controls.length * 8);
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
    clearPanel: async () => { events.push(['clear']); },
    resetToLogo: async () => { assert.fail('the logo must not reappear after fading to black'); },
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
  assert.deepEqual(events.slice(-2), [['clear'], ['close']]);
  assert.equal(device.info.connected, false);
  assert.equal(device.info.closing, false);
  assert.equal(device.info.error, '');
  await device.close();
  assert.equal(events.filter(event => event[0] === 'close').length, 1);
});

test('An animation write error still closes the device cleanly', async () => {
  const { device, events } = deviceWithDeck({ sendPreparedBuffer: async () => { throw new Error('USB write failed'); } });
  await device.close();
  assert.deepEqual(events, [['clear'], ['close']]);
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
  assert.deepEqual(events, [['clear'], ['close']]);
});

test('Quitting without connected hardware needs no animation', async () => {
  const device = new Devices({ onStatus: () => {} });
  await device.close();
  assert.equal(device.stopping, true);
  assert.equal(device.shutdownController, undefined);
});
