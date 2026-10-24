import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, makeKey, validateState, duplicateKey, visibleKeys } from '../shared/model.js';
import { deckSlots, swapDeckSlots, currentFolder } from '../shared/deck-layout.js';

function workspace() {
  const state = initialState();
  const folder = state.profiles[0].keys[4];
  folder.children = Array.from({ length: 14 }, (_, i) => makeKey('delay', `Aktion ${i + 1}`));
  return { state, folder, path: [4] };
}

test('Existing folders keep the original first-slot back button; root profiles have none', () => {
  const { state, folder, path } = workspace();
  assert.ok(deckSlots(state, path)[0].isBack);
  assert.equal(deckSlots(state, path)[1].key.id, folder.children[0].id);
  assert.equal(deckSlots(state, path)[14].childIndex, 13);
  assert.ok(deckSlots(state).every(slot => !slot.isBack));
});

test('Dragging back onto an occupied key swaps only those physical positions', () => {
  const { state, folder, path } = workspace();
  const before = deckSlots(state, path);
  swapDeckSlots(state, path, 0, 9);
  const after = deckSlots(state, path);
  assert.equal(folder.backPosition, 9);
  assert.equal(after[9].isBack, true);
  assert.equal(after[0].key.id, before[9].key.id);
  for (let i = 1; i < 15; i++) if (i !== 9) assert.equal(after[i].key.id, before[i].key.id);
  assert.equal(after.filter(slot => slot.isBack).length, 1);
  assert.equal(new Set(folder.children.map(k => k.id)).size, 14);
});

test('Back can be moved to an empty slot and a regular key can swap onto back', () => {
  const { state, folder, path } = workspace();
  folder.children[13] = null;
  const original = folder.children[0];
  swapDeckSlots(state, path, 0, 14);
  assert.equal(deckSlots(state, path)[0].key, null);
  assert.equal(deckSlots(state, path)[1].key.id, original.id);
  assert.equal(deckSlots(state, path)[14].isBack, true);
  swapDeckSlots(state, path, 1, 14);
  assert.equal(deckSlots(state, path)[1].isBack, true);
  assert.equal(deckSlots(state, path)[14].key.id, original.id);
  assert.equal(folder.children.filter(Boolean).length, 13);
});

test('Nested folders and action editing resolve the correct logical child after moves', () => {
  const { state, folder, path } = workspace();
  const nested = makeKey('folder', 'Unterordner'); nested.children = [makeKey('delay', 'Innen')];
  folder.children[8] = nested;
  swapDeckSlots(state, path, 0, 9);
  const nestedSlot = deckSlots(state, path)[0];
  assert.equal(nestedSlot.key.id, nested.id);
  const nestedPath = [...path, nestedSlot.childIndex];
  assert.equal(currentFolder(state, nestedPath).id, nested.id);
  swapDeckSlots(state, nestedPath, 0, 14);
  assert.equal(deckSlots(state, nestedPath)[14].isBack, true);
  assert.equal(deckSlots(state, path)[9].isBack, true, 'parent back position remains independent');
  const actionSlot = deckSlots(state, path)[10];
  visibleKeys(state, path)[actionSlot.childIndex].label = 'Bearbeitet';
  assert.equal(deckSlots(state, path)[10].key.label, 'Bearbeitet');
});

test('Back positions survive save/import and folder duplication; malformed positions are rejected', () => {
  const { state, folder, path } = workspace();
  swapDeckSlots(state, path, 0, 12);
  const restored = validateState(JSON.parse(JSON.stringify(state)));
  assert.equal(deckSlots(restored, path)[12].isBack, true);
  assert.equal(duplicateKey(folder).backPosition, 12);
  for (const invalid of [-1, 128, 1.5, '12', null]) {
    folder.backPosition = invalid;
    assert.throws(() => validateState(state), /Back key/);
  }
});

test('32-key layouts preserve hidden children when moving back on a smaller deck', () => {
  const { state, folder, path } = workspace();
  folder.children = Array.from({ length: 31 }, (_, i) => makeKey('delay', `XL ${i}`));
  swapDeckSlots(state, path, 0, 31, 32);
  assert.equal(deckSlots(state, path, 32)[31].isBack, true);
  const hidden = folder.children.slice(14).map(k => k.id);
  assert.equal(deckSlots(state, path, 15)[14].isBack, true, 'back stays accessible on a smaller grid');
  swapDeckSlots(state, path, 14, 3, 15);
  assert.equal(deckSlots(state, path, 15)[3].isBack, true);
  assert.deepEqual(folder.children.slice(14).map(k => k.id), hidden);
  assert.equal(new Set(folder.children.map(k => k.id)).size, 31);
  assert.equal(folder.children.length, 31);
});

test('Ordinary slot swaps respect the new back position and root swaps remain unchanged', () => {
  const { state, path } = workspace();
  swapDeckSlots(state, path, 0, 7);
  const before = deckSlots(state, path);
  swapDeckSlots(state, path, 0, 14);
  const after = deckSlots(state, path);
  assert.equal(after[0].key.id, before[14].key.id);
  assert.equal(after[14].key.id, before[0].key.id);
  assert.equal(after[7].isBack, true);
  const root = deckSlots(state);
  swapDeckSlots(state, [], 0, 14);
  assert.equal(deckSlots(state)[14].key.id, root[0].key.id);
  assert.equal(deckSlots(state)[0].key, null);
});
