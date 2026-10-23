export const backKey = { id: 'back', label: 'Zurück', icon: 'ArrowLeft', color: '#ad92ff', background: '#242231' };

export function isKeyActive(key, obs) {
  const action = key?.actions?.find(a => a.type === 'obs');
  if (!action || !obs?.connected) return false;
  return action.command === 'scene' ? obs.scene === action.scene
    : action.command === 'record' ? !!obs.recording
    : action.command === 'stream' ? !!obs.streaming : !!obs.muted?.[action.input];
}

// Only appearance matters: the same artwork can be reused on any page/slot.
export function visualSignature(key, active = false) {
  return JSON.stringify(key ? [key.label, key.icon, key.color, key.background, key.image || '', !!active] : null);
}

export function collectVisuals(state, obs) {
  const entries = new Map();
  function add(key) {
    const active = isKeyActive(key, obs);
    const signature = visualSignature(key, active);
    if (!entries.has(signature)) entries.set(signature, { key, active, signature });
  }
  function visit(keys) { for (const key of keys) if (key) { add(key); visit(key.children || []); } }
  add(null); add(backKey);
  state.profiles.forEach(profile => visit(profile.keys));
  return [...entries.values()];
}
