import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, makeKey, validateState, duplicateKey } from '../shared/model.js';
import { keyFontSize, keyTextLayout, globalFontSize, resolvedKeyFont, DEFAULT_FONT_SIZE, MIN_FONT_SIZE, MAX_FONT_SIZE } from '../shared/key-text.js';
import { visualSignature, collectVisuals } from '../shared/visuals.js';

test('Legacy labels retain size 16; custom sizes survive duplication and workspace round trips', () => {
  const state = initialState(), key = state.profiles[0].keys[0];
  delete key.fontSize;
  assert.doesNotThrow(() => validateState(state));
  assert.equal(keyFontSize(key), DEFAULT_FONT_SIZE);
  key.fontSize = 28;
  assert.equal(duplicateKey(key).fontSize, 28);
  assert.equal(validateState(JSON.parse(JSON.stringify(state))).profiles[0].keys[0].fontSize, 28);
  for (const invalid of [null, '20', 9, 33, 16.5, NaN]) {
    key.fontSize = invalid;
    assert.throws(() => validateState(state), /font size/);
  }
});

test('Hardware image caching distinguishes font sizes and treats implicit and explicit defaults equally', () => {
  const key = makeKey('hotkey'); delete key.fontSize;
  assert.equal(visualSignature(key), visualSignature({ ...key, fontSize: DEFAULT_FONT_SIZE }));
  assert.notEqual(visualSignature(key), visualSignature({ ...key, fontSize: 32 }));
  const state = initialState();
  state.profiles[0].keys = [key, { ...duplicateKey(key), fontSize: 32 }];
  const bank = collectVisuals(state);
  assert.ok(bank.some(entry => entry.signature === visualSignature(key)));
  assert.ok(bank.some(entry => entry.signature === visualSignature({ ...key, fontSize: 32 })));
});

test('Long labels fit two lines at every allowed size without overlapping the icon or exceeding the display', () => {
  for (let size = MIN_FONT_SIZE; size <= MAX_FONT_SIZE; size++) {
    const measure = text => Array.from(text).length * size * 0.55;
    for (const label of ['Mikrofon stummschalten', 'SuperlangesWortOhneLeerzeichenMitNochMehrText', 'Aufnahme\nstarten', 'Test 🎉 ÄÖÜ']) {
      const layout = keyTextLayout(label, size, measure);
      assert.ok(layout.lines.length <= 2);
      assert.ok(layout.lines.every(line => measure(line) <= 128));
      assert.ok(layout.iconY >= 0);
      assert.ok(layout.iconY + layout.iconSize < layout.textTop);
      assert.ok(layout.textTop + layout.lines.length * layout.lineHeight <= 136);
    }
  }
});

test('Large fonts wrap instead of being horizontally squeezed; overflow gets an ellipsis', () => {
  const text = 'BeschriftungOhneLeerzeichen'.repeat(3);
  const at = size => keyTextLayout(text, size, value => value.length * size * 0.55);
  assert.ok(at(32).lines[0].length < at(16).lines[0].length);
  assert.ok(at(32).lines.at(-1).endsWith('…'));
  const empty = keyTextLayout('', 32, () => 0);
  assert.deepEqual(empty.lines, []);
  assert.equal(empty.iconY, 46);
});

test('Global size is backwards compatible, validated and preserved by workspace export/import', () => {
  const state = initialState();
  delete state.settings.defaultFontSize;
  assert.equal(globalFontSize(validateState(state).settings), 16);
  state.settings.defaultFontSize = 24;
  assert.equal(globalFontSize(validateState(JSON.parse(JSON.stringify(state))).settings), 24);
  for (const invalid of [null, '24', 9, 33, 18.5]) {
    state.settings.defaultFontSize = invalid;
    assert.throws(() => validateState(state), /default font size/);
  }
});

test('Image banks inherit the global size throughout folders while retaining individual overrides', () => {
  const state = initialState(); state.settings.defaultFontSize = 24;
  const inherited = makeKey('hotkey'), custom = makeKey('url'); custom.fontSize = 20;
  state.profiles[0].keys[4].children = [inherited, custom];
  const bank = collectVisuals(state);
  assert.equal(bank.find(entry => entry.key?.id === inherited.id).key.fontSize, 24);
  assert.equal(bank.find(entry => entry.key?.id === custom.id).key.fontSize, 20);
  assert.equal(bank.find(entry => entry.key?.id === 'back').key.fontSize, 24);
  assert.equal(inherited.fontSize, undefined, 'rendering must not turn inheritance into an override');
  state.settings.defaultFontSize = 30;
  const next = collectVisuals(state);
  assert.notEqual(bank.find(entry => entry.key?.id === inherited.id).signature, next.find(entry => entry.key?.id === inherited.id).signature);
  assert.equal(bank.find(entry => entry.key?.id === custom.id).signature, next.find(entry => entry.key?.id === custom.id).signature);
});

test('New and duplicated keys inherit; resetting an override reconnects to the global default', () => {
  const settings = { defaultFontSize: 26 }, key = makeKey('hotkey');
  assert.equal(key.fontSize, undefined);
  assert.equal(resolvedKeyFont(duplicateKey(key), settings).fontSize, 26);
  key.fontSize = 12;
  assert.equal(resolvedKeyFont(key, settings).fontSize, 12);
  assert.equal(duplicateKey(key).fontSize, 12);
  delete key.fontSize;
  assert.equal(resolvedKeyFont(key, settings).fontSize, 26);
  settings.defaultFontSize = 32;
  assert.equal(resolvedKeyFont(key, settings).fontSize, 32);
});
