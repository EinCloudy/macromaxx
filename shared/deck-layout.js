import { visibleKeys } from './model.js';
import { backKey } from './visuals.js';

export function currentFolder(state, path) {
  return path.length ? visibleKeys(state, path.slice(0, -1))[path.at(-1)] : null;
}

// Folder children remain independent of the virtual back button. Both the
// editor and hardware translate physical slots through this same layout.
export function deckSlots(state, path = [], count = 15) {
  const keys = visibleKeys(state, path);
  const backIndex = path.length
    ? Math.min(currentFolder(state, path)?.backPosition ?? 0, count - 1)
    : -1;
  return Array.from({ length: count }, (_, index) => {
    if (index === backIndex) return { key: backKey, isBack: true, childIndex: null };
    const childIndex = backIndex >= 0 && index > backIndex ? index - 1 : index;
    return { key: keys[childIndex] || null, isBack: false, childIndex };
  });
}

export function swapDeckSlots(state, path, from, to, count = 15) {
  if (![from, to].every((index) => Number.isInteger(index) && index >= 0 && index < count))
    throw new Error('Invalid key position.');
  if (from === to) return;
  const slots = deckSlots(state, path, count);
  const keys = visibleKeys(state, path);
  if (slots[from].isBack || slots[to].isBack) {
    const folder = currentFolder(state, path);
    if (!folder) throw new Error('Folder not found.');
    [slots[from], slots[to]] = [slots[to], slots[from]];
    folder.backPosition = slots.findIndex((slot) => slot.isBack);
    const visible = slots.filter((slot) => !slot.isBack).map((slot) => slot.key);
    // Retain children outside a smaller device's visible grid.
    keys.splice(0, count - 1, ...visible);
  } else {
    const a = slots[from].childIndex,
      b = slots[to].childIndex;
    while (keys.length <= Math.max(a, b)) keys.push(null);
    [keys[a], keys[b]] = [keys[b], keys[a]];
  }
}

// A drag keeps its original page even when hover navigation changes the view.
export function moveDeckSlot(state, source, path, to, count = 15) {
  if (
    !source ||
    source.profileId !== state.activeProfileId ||
    ![source.index, to].every((index) => Number.isInteger(index) && index >= 0 && index < count)
  )
    return false;
  const fromSlot = deckSlots(state, source.path, count)[source.index];
  if (!fromSlot.key || fromSlot.key.id !== source.keyId) return false;
  if (source.path.length === path.length && source.path.every((part, i) => part === path[i])) {
    swapDeckSlots(state, path, source.index, to, count);
    return true;
  }
  const toSlot = deckSlots(state, path, count)[to];
  if (fromSlot.isBack || toSlot.isBack) return false;
  const fromAddress = [...source.path, fromSlot.childIndex];
  const toAddress = [...path, toSlot.childIndex];
  const contains = (parent, child) =>
    parent.length <= child.length && parent.every((part, i) => part === child[i]);
  // Never move a folder into itself, or swap a child with its own ancestor.
  if (contains(fromAddress, path) || contains(toAddress, source.path)) return false;
  const fromKeys = visibleKeys(state, source.path);
  const toKeys = visibleKeys(state, path);
  while (toKeys.length <= toSlot.childIndex) toKeys.push(null);
  [fromKeys[fromSlot.childIndex], toKeys[toSlot.childIndex]] = [toSlot.key, fromSlot.key];
  return true;
}
