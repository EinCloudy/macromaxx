import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesApplication, matchingProfile } from '../shared/profile-rules.js';
import { initialState, makeProfile, validateState } from '../shared/model.js';
import { AutoProfiles } from '../electron/auto-profiles.js';
test('Application glob patterns match literally except for documented wildcards', () => {
  assert.equal(matchesApplication('org.mozilla.*', 'ORG.MOZILLA.Firefox'), true);
  assert.equal(matchesApplication('code?', 'code1'), true);
  assert.equal(matchesApplication('code+', 'codeeeee'), false);
  assert.equal(matchesApplication('a[b]', 'a[b]'), true);
});
test('Automatic profiles match apps, retain custom labels and fall back to the manual profile', async () => {
  const state = initialState(), original = state.activeProfileId, editor = makeProfile('Editor'); editor.appRules = ['code*']; state.profiles.push(editor); state.settings.autoProfiles = true;
  assert.equal(matchingProfile(state, 'Code').id, editor.id); assert.doesNotThrow(() => validateState(state));
  const auto = new AutoProfiles(() => state, async id => { state.activeProfileId = id; }, error => { throw error; });
  await auto.apply('code'); assert.equal(state.activeProfileId, editor.id);
  await auto.apply('other'); assert.equal(state.activeProfileId, original);
  auto.manual(editor.id); await auto.apply('other'); assert.equal(state.activeProfileId, editor.id);
  auto.close();
});
test('MacroMaxx focus and disabled detection do not switch profiles', async () => {
  const state = initialState(); state.settings.autoProfiles = true; let count = 0;
  const auto = new AutoProfiles(() => state, async () => count++, () => {});
  auto.update({ available: true, appId: 'macromaxx.desktop' });
  await new Promise(resolve => setTimeout(resolve, 220)); assert.equal(count, 0); auto.close();
});
