import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const kind = process.argv[2];
if (kind === 'critical') {
  const sharp = (await import('sharp')).default;
  await sharp({ create: { width: 1, height: 1, channels: 3, background: '#000' } }).png().toBuffer();
  const hid = require('node-hid'); await hid.devicesAsync();
  console.log('Electron native verification: sharp and node-hid loaded successfully.');
} else if (kind === 'robot') {
  const robot = require('@jitsi/robotjs'); robot.setKeyboardDelay(0);
  // Do not generate input or request screen access during a build.
  console.log('Electron native verification: @jitsi/robotjs loaded successfully (no input generated).');
} else if (kind === 'audio') {
  const { OfflineAudioContext } = await import('node-web-audio-api');
  const context = new OfflineAudioContext(1, 16, 48000); const buffer = await context.startRendering();
  if (buffer.length !== 16) throw new Error('Offline audio rendering failed.');
  console.log('Electron native verification: node-web-audio-api rendered offline successfully (no physical output).');
} else if (kind === 'media') {
  const { readPlayers } = await import('../plugins/native/media/adapters.js');
  const { run } = await import('../electron/commands.js');
  const players = await readPlayers(process.platform, run);
  if (!Array.isArray(players)) throw new Error('Media session adapter returned invalid data.');
  console.log('Electron media verification: OS media sessions read successfully (no playback changes).');
}
