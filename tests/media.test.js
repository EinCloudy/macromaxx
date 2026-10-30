import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Media } from '../plugins/native/media/service.js';
import { selectPlayer } from '../plugins/native/media/players.js';
import { create, mediaVisual, tileVisual } from '../plugins/native/media/index.js';
import { liveKey, isKeyActive } from '../shared/visuals.js';
import { loadCover } from '../plugins/native/media/cover.js';
import sharp from 'sharp';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
test('Player resolution prefers playing media and survives browser instance ID changes', () => {
  const state = { players: [{ id: 'vlc', status: 'Paused' }, { id: 'firefox.instance42', status: 'Playing' }] };
  assert.equal(selectPlayer(state).id, 'firefox.instance42');
  assert.equal(selectPlayer(state, 'firefox.instance7').id, 'firefox.instance42');
  assert.equal(selectPlayer(state, 'missing'), undefined);
});
test('Cover follows the selected player and falls back to the configured image', async () => {
  let art = 'https://example.com/first';
  let loads = 0;
  const media = new Media(() => {}, async (_, args) => {
    if (args[0] === '-l') return 'spotify';
    if (args[2] === 'status') return 'Playing';
    if (args[2] === 'metadata') return `Track\u001fArtist\u001f${art}`;
    return '0.5';
  }, async url => { loads++; return `data:image/png;base64,${Buffer.from(url).toString('base64')}`; }, 'linux');
  const key = { id: 'key', label: 'Tile', image: 'original', actions: [{ type: 'tile', content: 'album-cover', player: 'spotify' }] };
  await media.refresh();
  const live = () => ({ native: { visuals: { key: tileVisual(key, media.state) } } });
  assert.equal(liveKey(key, live()).image, media.state.players[0].cover);
  assert.equal(key.image, 'original');
  await media.refresh();
  assert.equal(loads, 1);
  art = 'https://example.com/second';
  await media.refresh();
  assert.equal(loads, 2);
  assert.equal(liveKey(key, live()).image, media.state.players[0].cover);
  art = '';
  await media.refresh();
  assert.equal(liveKey(key, live()).image, 'original');
  media.state.players = [];
  assert.equal(liveKey(key, live()).image, 'original');
});
test('Cover loader accepts local images and ignores invalid artwork', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'macromaxx-cover-'));
  try {
    const path = join(dir, 'cover.png');
    await writeFile(path, await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ff0000' } }).png().toBuffer());
    assert.match(await loadCover(pathToFileURL(path).href), /^data:image\/png;base64,/);
    const data = await loadCover(pathToFileURL(path).href);
    assert.match(await loadCover(data), /^data:image\/png;base64,/);
    assert.equal(await loadCover('data:image/png;base64,broken'), '');
    assert.equal(await loadCover('file:///nonexistent-cover.png'), '');
    assert.equal(await loadCover('ftp://example.com/cover.png'), '');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('MPRIS targets the selected player and updates its title without changing the stored label', async () => {
  const commands = [];
  const media = new Media(() => {}, async (_, args) => {
    if (args[0] === '-l') return 'vlc\nspotify';
    if (args[2] === 'status') return args[1] === 'spotify' ? 'Playing' : 'Paused';
    if (args[2] === 'metadata') return 'Track\u001fArtist';
    if (args[2] === 'volume' && args.length === 3) return '0.4';
    commands.push(args); return '';
  }, undefined, 'linux');
  await media.execute({ command: 'playpause', player: 'vlc' });
  assert.deepEqual(commands[0], ['--player', 'vlc', 'play-pause']);
  await media.execute({ command: 'player-volumeup', player: 'spotify', step: 5 });
  assert.deepEqual(commands[1], ['--player', 'spotify', 'volume', '0.45']);
  const key = { id: 'media-key', label: 'Original', actions: [{ type: 'media', command: 'playpause', player: 'spotify', showTitle: true, showArtist: true }] };
  const live = { native: { visuals: { [key.id]: mediaVisual(key, media.state) } } };
  assert.equal(liveKey(key, live).label, 'Track · Artist');
  assert.equal(key.label, 'Original'); assert.equal(isKeyActive(key, null, live), true);
});
test('Tile content and overlays are independent of playback controls and stored appearance', () => {
  const key = { id: 'tile', label: 'Original', image: 'original', actions: [{ type: 'tile', content: 'album-cover', player: 'vlc' }] };
  const state = { players: [{ id: 'spotify', title: 'Wrong', cover: 'wrong', status: 'Playing' }, { id: 'vlc', title: 'Track', artist: 'Artist', cover: 'cover', status: 'Paused' }] };
  assert.deepEqual(tileVisual(key, state), { active: false, label: '', image: 'cover' });
  key.actions[0].showTitle = true; key.actions[0].showArtist = true;
  assert.equal(tileVisual(key, state).label, 'Track · Artist');
  key.actions[0].content = 'track-info';
  assert.deepEqual(tileVisual(key, state), { active: false, label: 'Track · Artist', image: '' });
  assert.equal(key.label, 'Original'); assert.equal(key.image, 'original');
  key.actions[0].player = 'missing';
  assert.equal(tileVisual(key, state), null);
  assert.equal(mediaVisual(key, state), null);
});
test('Tile text selection and scrolling preserve legacy defaults', () => {
  const action = { type: 'tile', content: 'track-info' };
  const key = { actions: [action] };
  const state = { players: [{ id: 'player', status: 'Playing', title: 'Track', artist: 'Artist', cover: 'cover' }] };
  assert.equal(tileVisual(key, state).label, 'Track');
  for (const [fields, expected] of [['title', 'Track'], ['artist', 'Artist'], ['both', 'Track · Artist'], ['none', '']]) {
    action.textFields = fields;
    assert.equal(tileVisual(key, state).label, expected);
    action.content = 'album-cover';
    assert.equal(tileVisual(key, state).label, expected);
    action.content = 'track-info';
  }
  action.textFields = 'both'; action.scrollText = true;
  assert.equal(tileVisual(key, state, 42).scrollFrame, 42);
  assert.equal(tileVisual(key, state, 42).scrollSpeed, 'normal');
  action.scrollSpeed = 'fast';
  assert.equal(tileVisual(key, state, 42).scrollSpeed, 'fast');
  action.textLayout = 'stacked';
  assert.equal(tileVisual(key, state).label, 'Track\nArtist');
  assert.equal(tileVisual(key, state).textLayout, 'stacked');
  action.content = 'album-cover';
  assert.equal(tileVisual(key, state).label, 'Track\nArtist');
  state.players[0].title = '';
  assert.equal(tileVisual(key, state).label, 'Artist');
});
test('Windows and macOS metadata adapters drive the same Tile without Linux commands', async () => {
  const image = 'data:image/png;base64,' + (await sharp({ create: { width: 2, height: 2, channels: 3, background: '#123456' } }).png().toBuffer()).toString('base64');
  for (const platform of ['win32', 'darwin']) {
    const calls = []; let playing = true;
    const plugin = await create({ platform, changed: () => {}, service: () => null, runCommand: async (command, args) => {
      calls.push([command, args]);
      if (command === 'osascript') return '1';
      if (platform === 'win32') return JSON.stringify(playing ? [{ id: 'spotify', status: 'Playing', title: 'Track', artist: 'Artist', artUrl: image }] : []);
      return JSON.stringify(playing ? { bundleIdentifier: 'com.spotify.client', playing: true, title: 'Track', artist: 'Artist', artworkData: image.split(',')[1], artworkMimeType: 'image/png' } : null);
    } });
    assert.equal(plugin.capabilities()['media.tiles'].available, true);
    const key = { actions: [{ type: 'tile', content: 'album-cover', showTitle: true }] };
    assert.match(plugin.visual(key).image, /^data:image\/png;base64,/);
    assert.equal(plugin.visual(key).label, 'Track');
    const before = calls.length;
    await plugin.actions.tile(key.actions[0]);
    assert.equal(calls.length, before, 'display-only Tile must not send commands');
    playing = false; await plugin.operations.refresh();
    assert.equal(plugin.visual(key), null, 'closed sessions must clear the live image');
    assert.ok(calls.every(([command]) => platform === 'win32' ? command === 'powershell.exe' : ['/usr/bin/perl', 'osascript'].includes(command)));
    if (platform === 'darwin') assert.ok(calls.some(([, args]) => args[1]?.endsWith('MediaRemoteAdapter.framework') && args[2] === 'get'));
    plugin.close();
  }
});
test('Metadata adapter failures disable Tiles without disabling global media controls', async () => {
  const plugin = await create({ platform: 'win32', changed: () => {}, service: () => ({ integrationAvailable: true }), runCommand: async () => { throw new Error('Unavailable'); } });
  assert.equal(plugin.capabilities()['media.tiles'].available, false);
  assert.match(plugin.status().media.error, /Unavailable/);
  assert.equal(plugin.capabilities()['media.controls'].available, true);
  plugin.close();
});
test('Cover downloads are normalized and reject HTTP failures and excessive input', async t => {
  const png = await sharp({ create: { width: 2, height: 4, channels: 3, background: '#123456' } }).png().toBuffer();
  const server = createServer((req, res) => {
    if (req.url === '/missing') { res.writeHead(404); res.end(); }
    else if (req.url === '/large') { res.writeHead(200, { 'content-length': 6 * 1024 * 1024 }); res.end(); }
    else { res.writeHead(200, { 'content-type': 'image/png' }); res.end(png); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}`;
  const result = await loadCover(url);
  const size = await sharp(Buffer.from(result.split(',')[1], 'base64')).metadata();
  assert.equal(size.width, 256); assert.equal(size.height, 256);
  assert.equal(await loadCover(`${url}/missing`), '');
  assert.equal(await loadCover(`${url}/large`), '');
  assert.equal(await loadCover('data:image/png;base64,' + 'A'.repeat(8 * 1024 * 1024)), '');
});
test('Failed artwork is retried, reused URLs refresh for new tracks, and shutdown ignores in-flight results', async () => {
  let title = 'First', available = false, updates = 0, loads = 0;
  const media = new Media(() => { updates++; }, async (_, args) => {
    if (args[0] === '-l') return 'player';
    if (args[2] === 'status') return 'Playing';
    if (args[2] === 'metadata') return `${title}\u001fArtist\u001ffile:///cover.png`;
    return '0.5';
  }, async () => { loads++; if (!available) throw new Error('Missing'); return 'cover'; }, 'linux');
  await media.refresh(); assert.equal(media.state.players[0].cover, '');
  available = true; await media.refresh(); assert.equal(media.state.players[0].cover, 'cover');
  assert.equal(loads, 2);
  title = 'Second'; await media.refresh(); assert.equal(loads, 3);
  title = 'Third'; const refreshing = media.refresh(); const count = updates;
  media.close(); await refreshing;
  assert.equal(updates, count);
  assert.equal(media.state.players[0].title, 'Second');
});
