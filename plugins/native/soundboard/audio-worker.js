import fs from 'node:fs/promises';
let AudioContext, context, closed = false;
let pendingPlays = 0, idleTimer, suspending = Promise.resolve();
const sessions = new Map(), canceled = new Set(), cache = new Map();
let cachedBytes = 0;
function suspendWhenIdle() {
  clearTimeout(idleTimer);
  if (closed || sessions.size || pendingPlays || !context) return;
  idleTimer = setTimeout(() => {
    if (!closed && !sessions.size && !pendingPlays) suspending = context.suspend().catch(() => {});
  }, 100);
}
try { ({ AudioContext } = await import('node-web-audio-api')); process.send({ type: 'ready' }); }
catch (error) { process.send({ type: 'ready', error: error.message }); }
function stop(id) {
  canceled.add(id);
  const session = sessions.get(id);
  if (session) { try { session.source.stop(); } catch { /* source already ended */ } }
}
async function execute(message) {
  if (message.command === 'close') {
    closed = true; clearTimeout(idleTimer); for (const id of sessions.keys()) stop(id);
    await context?.close(); cache.clear(); return true;
  }
  if (message.command === 'stop') { stop(message.sessionId); return true; }
  if (message.command !== 'play' || closed || !AudioContext) throw new Error('Shared audio backend is not available.');
  clearTimeout(idleTimer);
  try { context ||= new AudioContext({ latencyHint: 'playback', ...(process.argv.includes('--silent') ? { sinkId: { type: 'none' } } : {}) }); }
  catch (error) { error.code = 'AUDIO_BACKEND_UNAVAILABLE'; throw error; }
  const stat = await fs.stat(message.path);
  if (!stat.isFile() || stat.size > 64 * 1024 * 1024) throw new Error('Choose an audio file up to 64 MB for shared playback.');
  const key = `${message.path}:${stat.size}:${stat.mtimeMs}`;
  let buffer = cache.get(key)?.buffer;
  if (!buffer) {
    const bytes = await fs.readFile(message.path);
    buffer = await context.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const size = buffer.length * buffer.numberOfChannels * 4;
    if (size <= 64 * 1024 * 1024) {
      while (cache.size && cachedBytes + size > 64 * 1024 * 1024) { const oldest = cache.keys().next().value; cachedBytes -= cache.get(oldest).size; cache.delete(oldest); }
      cache.set(key, { buffer, size }); cachedBytes += size;
    }
  }
  if (closed || canceled.delete(message.sessionId)) return { started: false };
  await suspending; await context.resume();
  if (closed || canceled.delete(message.sessionId)) return { started: false };
  const source = context.createBufferSource(), gain = context.createGain();
  source.buffer = buffer; source.loop = !!message.loop; gain.gain.value = message.volume / 100;
  source.connect(gain); gain.connect(context.destination);
  sessions.set(message.sessionId, { source, gain });
  source.onended = () => {
    source.disconnect(); gain.disconnect(); sessions.delete(message.sessionId); canceled.delete(message.sessionId);
    suspendWhenIdle();
    if (process.connected) process.send({ type: 'ended', sessionId: message.sessionId });
  };
  source.start(); return { started: true };
}
process.on('message', async message => {
  if (message.command === 'play') pendingPlays++;
  try { const result = await execute(message); if (process.connected) process.send({ id: message.id, result }); }
  catch (error) { if (process.connected) process.send({ id: message.id, error: error.message, code: error.code }); }
  finally { if (message.command === 'play') pendingPlays--; suspendWhenIdle(); }
});
process.on('disconnect', () => { closed = true; context?.close().finally(() => process.exit(0)); if (!context) process.exit(0); });
