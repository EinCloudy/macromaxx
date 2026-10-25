let robot;
const held = new Map();
const release = () => { for (const chord of [...held.values()].reverse()) { try { robot.keyToggle(chord.key, 'up', chord.modifiers); } catch { /* best-effort OS cleanup */ } } held.clear(); };
try {
  const module = await import('@jitsi/robotjs'); robot = module.default || module;
  if (process.platform === 'linux' && !process.env.WAYLAND_DISPLAY) robot.getScreenSize();
  robot.setKeyboardDelay(0); process.send({ type: 'ready' });
} catch (error) { process.send({ type: 'ready', error: error.message }); }
process.on('message', message => {
  try {
    if (message.command === 'close') { release(); process.send({ id: message.id, result: true }); return; }
    if (message.command !== 'keys' || !robot) throw new Error('Unknown shared-keyboard request.');
    const { chord, mode } = message;
    const id = JSON.stringify(chord);
    if (mode === 'tap') robot.keyTap(chord.key, chord.modifiers);
    else if (mode === 'down') { robot.keyToggle(chord.key, 'down', chord.modifiers); held.set(id, chord); }
    else { robot.keyToggle(chord.key, 'up', chord.modifiers); held.delete(id); }
    process.send({ id: message.id, result: true });
  } catch (error) { process.send({ id: message.id, error: error.message }); }
});
process.on('disconnect', () => { release(); process.exit(0); });
process.on('SIGTERM', () => { release(); process.exit(0); });
