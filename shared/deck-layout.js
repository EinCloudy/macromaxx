import { visibleKeys } from './model.js';
import { backKey } from './visuals.js';

export function currentFolder(state, path) {
  return path.length ? visibleKeys(state, path.slice(0, -1))[path.at(-1)] : null;
}

// Folder children remain independent of the virtual back button. Both the
// editor and hardware translate physical slots through this same layout.
export function deckSlots(state, path = [], count = 15) {
  const keys = visibleKeys(state, path);
  const backIndex = path.length ? Math.min(currentFolder(state, path)?.backPosition ?? 0, count - 1) : -1;
  return Array.from({ length: count }, (_, index) => {
    if (index === backIndex) return { key: backKey, isBack: true, childIndex: null };
    const childIndex = backIndex >= 0 && index > backIndex ? index - 1 : index;
    return { key: keys[childIndex] || null, isBack: false, childIndex };
  });
}

export function swapDeckSlots(state, path, from, to, count = 15) {
  if (![from, to].every(index => Number.isInteger(index) && index >= 0 && index < count)) throw new Error('Ungültige Tastenposition.');
  if (from === to) return;
  const slots = deckSlots(state, path, count);
  const keys = visibleKeys(state, path);
  if (slots[from].isBack || slots[to].isBack) {
    const folder = currentFolder(state, path);
    if (!folder) throw new Error('Ordner nicht gefunden.');
    [slots[from], slots[to]] = [slots[to], slots[from]];
    folder.backPosition = slots.findIndex(slot => slot.isBack);
    const visible = slots.filter(slot => !slot.isBack).map(slot => slot.key);
    // Retain children outside a smaller device's visible grid.
    keys.splice(0, count - 1, ...visible);
  } else {
    const a = slots[from].childIndex, b = slots[to].childIndex;
    while (keys.length <= Math.max(a, b)) keys.push(null);
    [keys[a], keys[b]] = [keys[b], keys[a]];
  }
}
