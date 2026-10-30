import { keyFontSize, resolvedKeyFont } from './key-text.js';
export const backKey = {
  id: 'back',
  label: 'Back',
  icon: 'ArrowLeft',
  color: '#ad92ff',
  background: '#242231',
};

export function isKeyActive(key, obs, live = {}) {
  const native = live.native?.visuals?.[key?.id];
  if (typeof native?.active === 'boolean') return native.active;
  const action = key?.actions?.find((a) => a.type === 'obs');
  if (!action || !obs?.connected) return false;
  return action.command === 'scene'
    ? obs.scene === action.scene
    : action.command === 'record'
      ? !!obs.recording
      : action.command === 'stream'
        ? !!obs.streaming
        : !!obs.muted?.[action.input];
}

export function liveKey(key, live = {}) {
  const patch = live.native?.visuals?.[key?.id];
  return patch
    ? {
        ...key,
        ...(typeof patch.label === 'string' ? { label: patch.label.slice(0, 1000) } : {}),
        ...(typeof patch.image === 'string' ? { image: patch.image } : {}),
        ...(Number.isSafeInteger(patch.scrollFrame) ? { scrollFrame: patch.scrollFrame } : {}),
        ...(['slow', 'normal', 'fast'].includes(patch.scrollSpeed) ? { scrollSpeed: patch.scrollSpeed } : {}),
      }
    : key;
}

// Only appearance matters: the same artwork can be reused on any page/slot.
export function visualSignature(key, active = false) {
  return JSON.stringify(
    key
      ? [
          key.label,
          key.icon,
          key.color,
          key.background,
          key.image || '',
          keyFontSize(key),
          !!active,
          key.scrollFrame ?? null,
          key.scrollSpeed ?? null,
        ]
      : null,
  );
}

export function collectVisuals(state, obs, live = {}) {
  const entries = new Map();
  function add(key) {
    key = resolvedKeyFont(liveKey(key, live), state.settings);
    const active = isKeyActive(key, obs, live);
    const signature = visualSignature(key, active);
    if (!entries.has(signature)) entries.set(signature, { key, active, signature });
  }
  function visit(keys) {
    for (const key of keys)
      if (key) {
        add(key);
        visit(key.children || []);
      }
  }
  add(null);
  add(backKey);
  state.profiles.forEach((profile) => visit(profile.keys));
  return [...entries.values()];
}
