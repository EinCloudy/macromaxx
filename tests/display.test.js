import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { Devices } from '../electron/devices.js';
import { initialState, makeKey } from '../shared/model.js';
import { backKey, collectVisuals, visualSignature, isKeyActive, liveKey } from '../shared/visuals.js';
import { tileVisual } from '../plugins/native/media/index.js';
import { resolvedKeyFont } from '../shared/key-text.js';

async function artwork(key, red) {
  const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: { r: red, g: 0, b: 0 } } }).png().toBuffer();
  return { signature: visualSignature(key), image: 'data:image/png;base64,' + png.toString('base64') };
}

function fakeDeck(getKeys) {
  const writes = [];
  const device = new Devices({ getKeys, getBrightness: () => 65, onStatus: () => {} });
  device.deck = { setBrightness: async () => {}, fillKeyBuffer: async (index, buffer) => writes.push({ index, pixels: [...buffer] }) };
  device.controls = [{ index: 0, feedbackType: 'lcd', pixelSize: { width: 1, height: 1 } }];
  return { device, writes };
}

test('Preloaded folder and parent artwork is reused immediately without new renderer images', async () => {
  const parent = makeKey('folder'), child = makeKey('hotkey');
  let keys = [parent];
  const { device, writes } = fakeDeck(() => keys);
  await device.setImages([await artwork(parent, 10), await artwork(child, 20), await artwork(backKey, 30)]);
  assert.deepEqual(writes.map(w => w.pixels[0]), [10]);
  keys = [backKey]; await device.render();
  keys = [child]; await device.render();
  keys = [parent]; await device.render();
  assert.deepEqual(writes.map(w => w.pixels[0]), [10, 30, 20, 10]);
  assert.equal(device.cache.size, 3);
  await device.render(); assert.equal(writes.length, 4, 'unchanged artwork is not resent');
});

test('Missing artwork never writes a temporary placeholder or stale slot image', async () => {
  const parent = makeKey('folder'), child = makeKey('hotkey'); let keys = [parent];
  const { device, writes } = fakeDeck(() => keys);
  const parentImage = await artwork(parent, 10);
  await device.setImages([parentImage]);
  keys = [child]; await device.render();
  assert.equal(writes.length, 1, 'keep the old image until the exact new artwork arrives');
  await device.setImages([parentImage, await artwork(child, 20)]);
  assert.deepEqual(writes.map(w => w.pixels[0]), [10, 20]);
});

test('Rapid navigation drops queued intermediate pages', async () => {
  const a = makeKey('folder'), b = makeKey('hotkey'), c = makeKey('url'); let keys = [a];
  const { device, writes } = fakeDeck(() => keys);
  await device.setImages([await artwork(a, 10), await artwork(b, 20), await artwork(c, 30)]);
  keys = [b]; const first = device.render(); keys = [c]; const second = device.render();
  await Promise.all([first, second]);
  assert.deepEqual(writes.map(w => w.pixels[0]), [10, 30]);
});

test('Image bank includes nested folders, blank keys, back button and OBS appearance', () => {
  const state = initialState(); const nested = makeKey('obs'); nested.actions[0].scene = 'Desktop';
  state.profiles[0].keys[4].children = [nested];
  const obs = { connected: true, scene: 'Desktop' };
  const bank = collectVisuals(state, obs);
  assert.ok(bank.some(v => v.signature === visualSignature(null)));
  assert.ok(bank.some(v => v.signature === visualSignature(backKey)));
  assert.ok(bank.some(v => v.signature === visualSignature(nested, true)));
  const copy = { ...nested, id: 'another-slot', actions: [] };
  assert.equal(visualSignature(copy), visualSignature(nested), 'slot/action IDs do not invalidate artwork');
  assert.equal(isKeyActive(nested, obs), true);
  assert.notEqual(visualSignature(nested, true), visualSignature(nested, false));
});

test('Hardware picks globally sized artwork for inherited keys and preserves individual sizes', async () => {
  const inherited = makeKey('hotkey'), custom = makeKey('url'); custom.fontSize = 18;
  const settings = { defaultFontSize: 24 };
  const writes = [];
  const device = new Devices({ getKeys: () => [inherited, custom], getSettings: () => settings, getBrightness: () => 65, onStatus: () => {} });
  device.deck = { setBrightness: async () => {}, fillKeyBuffer: async (index, buffer) => writes.push([index, buffer[0]]) };
  device.controls = [0, 1].map(index => ({ index, feedbackType: 'lcd', pixelSize: { width: 1, height: 1 } }));
  const assets = () => Promise.all([inherited, custom].map(key => {
    const resolved = resolvedKeyFont(key, settings);
    return artwork(resolved, resolved.fontSize);
  }));
  await device.setImages(await assets());
  assert.deepEqual(writes, [[0, 24], [1, 18]]);
  settings.defaultFontSize = 30;
  await device.setImages(await assets());
  assert.deepEqual(writes, [[0, 24], [1, 18], [0, 30]]);
  assert.equal(inherited.fontSize, undefined);
  assert.equal(custom.fontSize, 18);
});
test('Tile cover changes and fallback use identical editor and hardware signatures', async () => {
  const state = initialState(), tile = makeKey('tile');
  state.profiles[0].keys[0] = tile;
  let patch = tileVisual(tile, { players: [{ id: 'player', title: 'First', cover: 'data:image/png;base64,Zmlyc3Q=' }] });
  const live = () => ({ native: { visuals: { [tile.id]: patch } } });
  const { device, writes } = fakeDeck(() => [liveKey(tile, live())]);
  const send = async red => {
    const key = collectVisuals(state, null, live()).find(entry => entry.key?.id === tile.id).key;
    assert.equal(key.image, liveKey(tile, live()).image);
    await device.setImages([await artwork(key, red)]);
  };
  await send(10);
  patch = tileVisual(tile, { players: [{ id: 'player', title: 'Second', cover: 'data:image/png;base64,c2Vjb25k' }] });
  await send(20);
  patch = tileVisual(tile, { players: [] });
  await send(30);
  assert.deepEqual(writes.map(write => write.pixels[0]), [10, 20, 30]);
  assert.equal(tile.image, ''); assert.equal(tile.label, 'Tile');
});
