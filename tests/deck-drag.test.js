import test from 'node:test';
import assert from 'node:assert/strict';
import { createDragHover, DRAG_HOVER_DELAY } from '../src/features/editor/drag-hover.js';
import { deckSlots, moveDeckSlot, swapDeckSlots } from '../shared/deck-layout.js';
import { initialState, makeKey, validateState } from '../shared/model.js';

function hoverTimer(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hover = createDragHover();
  t.after(() => hover.cancel());
  return hover;
}

test('Hover opens after the delay without restarting on repeated dragover events', (t) => {
  const hover = hoverTimer(t);
  const opened = [];
  hover.hover(4, () => opened.push('folder'));
  t.mock.timers.tick(DRAG_HOVER_DELAY - 1);
  hover.hover(4, () => opened.push('folder'));
  assert.deepEqual(opened, []);
  t.mock.timers.tick(1);
  assert.deepEqual(opened, ['folder']);
  hover.hover(4, () => opened.push('folder'));
  t.mock.timers.tick(DRAG_HOVER_DELAY * 2);
  assert.deepEqual(opened, ['folder'], 'one navigation per target visit');
});

test('Changing the hover target starts a fresh delay', (t) => {
  const hover = hoverTimer(t);
  const opened = [];
  hover.hover(4, () => opened.push('folder'));
  t.mock.timers.tick(400);
  hover.hover(0, () => opened.push('back'));
  t.mock.timers.tick(DRAG_HOVER_DELAY - 1);
  assert.deepEqual(opened, []);
  t.mock.timers.tick(1);
  assert.deepEqual(opened, ['back']);
});

test('Leaving, dropping, cancelling or changing pages cancels pending navigation', (t) => {
  const hover = hoverTimer(t);
  let opened = 0;
  hover.hover(4, () => opened++);
  t.mock.timers.tick(400);
  hover.cancel();
  t.mock.timers.tick(DRAG_HOVER_DELAY);
  assert.equal(opened, 0);
  hover.hover(4, () => opened++);
  t.mock.timers.tick(DRAG_HOVER_DELAY);
  assert.equal(opened, 1, 'the same physical slot can open on a new page');
});

function sourceAt(state, path, index) {
  return {
    profileId: state.activeProfileId,
    path,
    index,
    keyId: deckSlots(state, path)[index].key.id,
  };
}

test('An existing action moves into a hovered folder, not from its new visible slot', () => {
  const state = initialState();
  const keys = state.profiles[0].keys;
  const action = keys[1];
  const source = sourceAt(state, [], 1);
  assert.equal(moveDeckSlot(state, source, [4], 1), true);
  assert.equal(keys[1], null);
  assert.equal(keys[4].children[0], action);
  assert.doesNotThrow(() => validateState(state));
});

test('An action can move up from nested folders using relocated Back keys', () => {
  const state = initialState();
  const folder = state.profiles[0].keys[4];
  const nested = makeKey('folder');
  const action = makeKey('delay');
  nested.children = [action];
  folder.children = [nested];
  swapDeckSlots(state, [4, 0], 0, 10);
  const source = sourceAt(state, [4, 0], 1);
  assert.equal(moveDeckSlot(state, source, [], 9), true);
  assert.deepEqual(nested.children.filter(Boolean), []);
  assert.equal(state.profiles[0].keys[9], action);
  assert.equal(deckSlots(state, [4, 0])[10].isBack, true);
  assert.doesNotThrow(() => validateState(state));
});

test('Cross-folder drops swap occupied keys without losing assignments', () => {
  const state = initialState();
  const keys = state.profiles[0].keys;
  const original = keys[0];
  const target = makeKey('delay');
  keys[4].children = [target];
  assert.equal(moveDeckSlot(state, sourceAt(state, [], 0), [4], 1), true);
  assert.equal(keys[0], target);
  assert.equal(keys[4].children[0], original);
});

test('Folders cannot move into themselves or swap with an ancestor', () => {
  const state = initialState();
  const folder = state.profiles[0].keys[4];
  const nested = makeKey('folder');
  nested.children = [makeKey('delay')];
  folder.children = [nested];
  const before = structuredClone(state);
  assert.equal(moveDeckSlot(state, sourceAt(state, [], 4), [4], 2), false);
  assert.equal(moveDeckSlot(state, sourceAt(state, [], 4), [4, 0], 2), false);
  assert.equal(moveDeckSlot(state, sourceAt(state, [4, 0], 1), [], 4), false);
  assert.deepEqual(state, before);
});

test('Back remains movable on its own page but cannot move between folders', () => {
  const state = initialState();
  const source = sourceAt(state, [4], 0);
  assert.equal(moveDeckSlot(state, source, [], 8), false);
  assert.equal(moveDeckSlot(state, sourceAt(state, [], 0), [4], 0), false);
  assert.equal(moveDeckSlot(state, source, [4], 8), true);
  assert.equal(deckSlots(state, [4])[8].isBack, true);
});

test('Ordinary same-page drags still swap keys', () => {
  const state = initialState();
  const keys = state.profiles[0].keys;
  const first = keys[0];
  const second = keys[1];
  assert.equal(moveDeckSlot(state, sourceAt(state, [], 0), [], 1), true);
  assert.equal(keys[0], second);
  assert.equal(keys[1], first);
});

test('Stale drags and drags from another profile cannot change keys', () => {
  const state = initialState();
  const source = sourceAt(state, [], 0);
  assert.equal(moveDeckSlot(state, { ...source, profileId: 'other' }, [4], 1), false);
  state.profiles[0].keys[0] = makeKey('delay');
  const before = structuredClone(state);
  assert.equal(moveDeckSlot(state, source, [4], 1), false);
  assert.equal(moveDeckSlot(state, source, [4], -1), false);
  assert.deepEqual(state, before);
});
