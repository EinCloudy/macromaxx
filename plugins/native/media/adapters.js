import { fileURLToPath } from 'node:url';

export const mediaBackends = { linux: 'Linux MPRIS / playerctl', win32: 'Windows media sessions (Windows 10 1809+)', darwin: 'macOS MediaRemote' };
const windowsScript = fileURLToPath(new URL('./windows-media.ps1', import.meta.url)).replace('app.asar/', 'app.asar.unpacked/').replace('app.asar\\', 'app.asar.unpacked\\');
// The helper is built and bundled with the app, not installed on the user's Mac.
const macDirectory = fileURLToPath(new URL('../../../build/mediaremote/', import.meta.url)).replace('app.asar/', 'app.asar.unpacked/');

export async function readPlayers(platform, run) {
  if (platform === 'linux') {
    const ids = await run('playerctl', ['-l']).catch(error => { if (error.code === 1) return ''; throw error; });
    return (await Promise.all([...new Set(ids.split('\n').filter(Boolean))].map(async id => {
      try {
        const [status, metadata, volume] = await Promise.all([
          run('playerctl', ['--player', id, 'status']),
          run('playerctl', ['--player', id, 'metadata', '--format', '{{title}}\u001f{{artist}}\u001f{{mpris:artUrl}}\u001f{{album}}']),
          run('playerctl', ['--player', id, 'volume']).catch(() => ''),
        ]);
        const [title = '', artist = '', artUrl = '', album = ''] = metadata.split('\u001f');
        return { id, status, title, artist, album, artUrl: artUrl.trim(), volume: Math.round((Number(volume) || 0) * 100) };
      } catch { return null; }
    }))).filter(Boolean);
  }
  if (platform === 'win32') {
    const players = JSON.parse(await run('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', windowsScript], { maxBuffer: 32 * 1024 * 1024 }));
    if (!Array.isArray(players)) throw new Error('Invalid Windows media session response.');
    return players;
  }
  if (platform === 'darwin') {
    const data = JSON.parse(await run('/usr/bin/perl', [`${macDirectory}mediaremote-adapter.pl`, `${macDirectory}MediaRemoteAdapter.framework`, 'get']));
    if (!data) return [];
    if (typeof data.bundleIdentifier !== 'string' || typeof data.title !== 'string') throw new Error('Invalid macOS media response.');
    return [{ id: data.bundleIdentifier, status: data.playing ? 'Playing' : 'Paused', title: data.title, artist: data.artist || '', album: data.album || '', artUrl: data.artworkData ? `data:${data.artworkMimeType || 'image/png'};base64,${data.artworkData}` : '', volume: null }];
  }
  throw new Error('This operating system has no media metadata adapter.');
}
