import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Devices } from '../electron/devices.js';

function fixture() {
  let listed = [{ path: 'old-path', serialNumber: 'serial', modelInfo: { name: 'Deck' } }];
  const opened = [], closed = []; let releases = 0;
  const devices = new Devices({
    getKeys: () => [], getBrightness: () => 50, onStatus: () => {}, onDisconnect: () => releases++,
    listDevices: async () => listed,
    openDevice: async path => {
      opened.push(path); const deck = new EventEmitter();
      deck.modelInfo = { name: 'Deck', controls: [{ type: 'button', index: 0, row: 0, column: 0, feedbackType: 'none' }] };
      deck.getSerialNumber = async () => 'serial'; deck.setBrightness = async () => {}; deck.close = async () => closed.push(path);
      return deck;
    },
  });
  return { devices, opened, closed, setList: value => { listed = value; }, releases: () => releases };
}
test('Reconnect identifies the same physical deck after its hidraw path changes', async () => {
  const f = fixture(); await f.devices.scan();
  f.setList([]); await f.devices.scan(); assert.equal(f.releases(), 1);
  f.setList([{ path: 'new-path', serialNumber: 'serial', modelInfo: { name: 'Deck' } }]);
  await f.devices.scan(); assert.deepEqual(f.opened, ['old-path', 'new-path']);
  assert.equal(f.devices.info.connected, true);
  await f.devices.disconnect();
});
test('Suspend releases the handle and resume reconnects without choosing a different device', async () => {
  const f = fixture(); await f.devices.scan(); await f.devices.suspend();
  f.setList([{ path: 'other', serialNumber: 'someone-else', modelInfo: { name: 'Other Deck' } }]);
  await f.devices.scan(); assert.equal(f.opened.length, 1);
  await f.devices.resume(); assert.equal(f.opened.length, 1);
  assert.match(f.devices.info.error, /selected Stream Deck/);
  f.setList([{ path: 'dock-path', serialNumber: 'serial', modelInfo: { name: 'Deck' } }]);
  await f.devices.scan(); assert.equal(f.opened.at(-1), 'dock-path'); await f.devices.disconnect();
});
