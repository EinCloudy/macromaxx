export const DEFAULT_FONT_SIZE = 16;
export const MIN_FONT_SIZE = 10;
export const MAX_FONT_SIZE = 32;

export function keyFontSize(key, defaultSize = DEFAULT_FONT_SIZE) {
  return Number.isInteger(key?.fontSize) &&
    key.fontSize >= MIN_FONT_SIZE &&
    key.fontSize <= MAX_FONT_SIZE
    ? key.fontSize
    : Number.isInteger(defaultSize) && defaultSize >= MIN_FONT_SIZE && defaultSize <= MAX_FONT_SIZE
      ? defaultSize
      : DEFAULT_FONT_SIZE;
}

export function globalFontSize(settings = {}) {
  return keyFontSize({ fontSize: settings.defaultFontSize });
}

// Resolve only for drawing, never write inherited sizes into the workspace.
export function resolvedKeyFont(key, settings = {}) {
  if (!key) return key;
  const fontSize = keyFontSize(key, globalFontSize(settings));
  return key.fontSize === fontSize ? key : { ...key, fontSize };
}

export function keyTextLayout(label, fontSize, measure) {
  const width = 128,
    lines = [];
  for (const paragraph of String(label || '').split(/\r?\n/)) {
    let line = '';
    for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
      const combined = line ? `${line} ${word}` : word;
      if (measure(combined) <= width) {
        line = combined;
        continue;
      }
      if (line) {
        lines.push(line);
        line = '';
      }
      for (const character of Array.from(word)) {
        if (line && measure(line + character) > width) {
          lines.push(line);
          line = '';
        }
        line += character;
      }
    }
    lines.push(line);
  }
  if (!label) lines.length = 0;
  const visible = lines.slice(0, 2);
  if (lines.length > 2) {
    const characters = Array.from(visible[1]);
    while (characters.length && measure(characters.join('') + '…') > width) characters.pop();
    visible[1] = characters.join('') + '…';
  }
  const lineHeight = Math.round(fontSize * 1.2);
  const textTop = Math.min(100, 136 - visible.length * lineHeight);
  const iconSize = visible.length ? Math.min(52, Math.max(24, textTop - 20)) : 52;
  const iconY = visible.length ? Math.max(8, (textTop - iconSize) / 2) : 46;
  return { lines: visible, fontSize, lineHeight, textTop, iconSize, iconY };
}

// A shared pixel offset keeps the editor and the rendered deck image in sync.
export function scrollingKeyText(label, frame, measure, speed = 'normal') {
  const text = String(label || '').replace(/\s+/g, ' ').trim();
  const width = measure(text);
  if (!Number.isSafeInteger(frame) || width <= 128) return null;
  const gap = 40;
  const step = speed === 'slow' ? 0.4 : speed === 'fast' ? 1.6 : 0.8;
  return { text, width, offset: (frame * step) % (width + gap), gap };
}
