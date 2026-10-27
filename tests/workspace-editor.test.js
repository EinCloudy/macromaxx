import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { createSaveQueue } from '../src/state/save-queue.js';
import { createHistory, changeHistory, undoHistory, redoHistory } from '../src/state/workspace-history.js';
import { initialState, makeAction, makeKey, duplicateProfile, validateState } from '../shared/model.js';

function saving(t, save) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const statuses = [];
  const errors = [];
  const writes = [];
  const queue = createSaveQueue({
    save: save || (async state => { writes.push(state); }),
    onStatus: status => statuses.push(status),
    onError: error => errors.push(error),
  });
  t.after(() => queue.cancel());
  return { queue, statuses, errors, writes };
}

test('Editor saves debounce rapid edits and write only the latest state', async t => {
  const { queue, writes, statuses } = saving(t);
  queue.schedule({ value: 1 });
  t.mock.timers.tick(200);
  queue.schedule({ value: 2 });
  t.mock.timers.tick(249);
  await setImmediate();
  assert.deepEqual(writes, []);
  t.mock.timers.tick(1);
  await setImmediate();
  assert.deepEqual(writes, [{ value: 2 }]);
  assert.equal(statuses.at(-1), 'Saved');
});

test('Explicit flush cancels debounce and serializes with writes already in flight', async t => {
  let finish;
  const writes = [];
  const { queue, statuses } = saving(t, async state => {
    writes.push(state);
    if (state.value === 1) await new Promise(resolve => { finish = resolve; });
  });
  queue.schedule({ value: 1 });
  t.mock.timers.tick(250);
  await setImmediate();
  queue.schedule({ value: 2 });
  const flushed = queue.flush({ value: 3 });
  assert.deepEqual(writes, [{ value: 1 }]);
  finish();
  await flushed;
  t.mock.timers.tick(1000);
  await setImmediate();
  assert.deepEqual(writes, [{ value: 1 }, { value: 3 }]);
  assert.equal(statuses.at(-1), 'Saved');
});

test('An older completed save does not mark newer pending edits as saved', async t => {
  let finish;
  const { queue, statuses } = saving(t, () => new Promise(resolve => { finish = resolve; }));
  queue.schedule({ value: 1 });
  t.mock.timers.tick(250);
  await setImmediate();
  queue.schedule({ value: 2 });
  finish();
  await setImmediate();
  assert.equal(statuses.at(-1), 'Saving …');
});

test('Save failures are reported and do not poison later writes', async t => {
  const failure = new Error('Disk full');
  const { queue, statuses, errors } = saving(t, async state => {
    if (state.value === 1) throw failure;
  });
  await assert.rejects(queue.flush({ value: 1 }), /Disk full/);
  assert.equal(statuses.at(-1), 'Save failed');
  assert.deepEqual(errors, [failure]);
  await queue.flush({ value: 2 });
  assert.equal(statuses.at(-1), 'Saved');
});

test('Replacing a workspace or disposing cancels its pending save', async t => {
  const { queue, writes } = saving(t);
  queue.schedule({ value: 1 });
  queue.cancel();
  t.mock.timers.tick(1000);
  await setImmediate();
  assert.deepEqual(writes, []);
});

test('History keeps immutable snapshots and clears redo after a branched edit', () => {
  const original = createHistory({ nested: { value: 0 } });
  const first = changeHistory(original, state => { state.nested.value = 1; });
  const second = changeHistory(first, state => { state.nested.value = 2; });
  assert.equal(original.state.nested.value, 0);
  assert.equal(first.state.nested.value, 1);
  assert.equal(undoHistory(second).state.nested.value, 1);
  assert.equal(redoHistory(undoHistory(second)).state.nested.value, 2);
  const branch = changeHistory(undoHistory(second), state => { state.nested.value = 3; });
  assert.deepEqual(branch.future, []);
  assert.equal(redoHistory(branch), branch);
  assert.equal(undoHistory(original), original);
});

test('History bounds retained snapshots and restores them in order', () => {
  let history = createHistory({ value: 0 });
  for (let value = 1; value <= 60; value++) history = changeHistory(history, state => { state.value = value; });
  assert.equal(history.history.length, 40);
  for (let value = 59; value >= 20; value--) {
    history = undoHistory(history);
    assert.equal(history.state.value, value);
  }
  assert.equal(undoHistory(history), history);
  for (let value = 21; value <= 60; value++) {
    history = redoHistory(history);
    assert.equal(history.state.value, value);
  }
});

test('Profile duplication renews every nested key and action ID without changing settings', () => {
  const state = initialState();
  const profile = state.profiles[0];
  profile.appRules = ['browser*'];
  profile.keys[4].backPosition = 3;
  profile.keys[4].children = [null, makeKey('url')];
  profile.keys[4].children[1].longActions.push(makeAction('delay'));
  const original = structuredClone(profile);
  const copy = duplicateProfile(profile);
  assert.deepEqual(profile, original);
  assert.notEqual(copy.id, profile.id);
  assert.equal(copy.name, `${profile.name} – Copy`);
  assert.deepEqual(copy.appRules, profile.appRules);
  assert.equal(copy.keys[4].backPosition, 3);
  function compare(keys, copies) {
    keys.forEach((key, index) => {
      if (!key) return assert.equal(copies[index], null);
      assert.notEqual(copies[index].id, key.id);
      for (const chain of ['actions', 'longActions']) key[chain].forEach((action, i) => {
        assert.notEqual(copies[index][chain][i].id, action.id);
        assert.deepEqual({ ...copies[index][chain][i], id: action.id }, action);
      });
      compare(key.children, copies[index].children);
    });
  }
  compare(profile.keys, copy.keys);
  state.profiles.push(copy);
  assert.doesNotThrow(() => validateState(state));
});
