import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Media } from '../plugins/native/media/service.js';
import { selectPlayer } from '../plugins/native/media/players.js';
import { mediaVisual } from '../plugins/native/media/index.js';
import { liveKey, isKeyActive } from '../shared/visuals.js';
test('Player resolution prefers playing media and survives browser instance ID changes', () => {
  const state = { players: [{ id: 'vlc', status: 'Paused' }, { id: 'firefox.instance42', status: 'Playing' }] };
  assert.equal(selectPlayer(state).id, 'firefox.instance42');
  assert.equal(selectPlayer(state, 'firefox.instance7').id, 'firefox.instance42');
  assert.equal(selectPlayer(state, 'missing'), undefined);
});
test('MPRIS targets the selected player and updates its title without changing the stored label', async () => {
  const commands = [];
  const media = new Media(() => {}, async (_, args) => {
    if (args[0] === '-l') return 'vlc\nspotify';
    if (args[2] === 'status') return args[1] === 'spotify' ? 'Playing' : 'Paused';
    if (args[2] === 'metadata') return 'Track\u001fArtist';
    if (args[2] === 'volume' && args.length === 3) return '0.4';
    commands.push(args); return '';
  });
  await media.execute({ command: 'playpause', player: 'vlc' });
  assert.deepEqual(commands[0], ['--player', 'vlc', 'play-pause']);
  await media.execute({ command: 'player-volumeup', player: 'spotify', step: 5 });
  assert.deepEqual(commands[1], ['--player', 'spotify', 'volume', '0.45']);
  const key = { id: 'media-key', label: 'Original', actions: [{ type: 'media', command: 'playpause', player: 'spotify', showTitle: true, showArtist: true }] };
  const live = { native: { visuals: { [key.id]: mediaVisual(key, media.state) } } };
  assert.equal(liveKey(key, live).label, 'Track · Artist');
  assert.equal(key.label, 'Original'); assert.equal(isKeyActive(key, null, live), true);
});
