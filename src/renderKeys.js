import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Icon } from './icons.jsx';
import { visualSignature } from '../shared/visuals.js';
import {
  keyFontSize,
  keyTextLayout,
  scrollingKeyText,
  stackedKeyText,
} from '../shared/key-text.js';
const cache = new Map();
async function image(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
export function renderKey(key, active = false) {
  const signature = visualSignature(key, active);
  if (!cache.has(signature)) {
    const pending = drawKey(key, active).catch((error) => {
      cache.delete(signature);
      throw error;
    });
    cache.set(signature, pending);
    if (cache.size > 2048) cache.delete(cache.keys().next().value);
  }
  return cache.get(signature);
}
async function drawKey(key, active) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 144;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = key?.background || '#17181d';
  ctx.fillRect(0, 0, 144, 144);
  if (key) {
    const fontSize = keyFontSize(key);
    ctx.font = `500 ${fontSize}px sans-serif`;
    const measure = (text) => ctx.measureText(text).width;
    const stacked = stackedKeyText(key, fontSize, measure);
    const scroll = stacked
      ? null
      : scrollingKeyText(key.label, key.scrollFrame, measure, key.scrollSpeed);
    const layout = stacked || keyTextLayout(scroll ? 'X' : key.label, fontSize, measure);
    if (key.image) ctx.drawImage(await image(key.image), 0, 0, 144, 144);
    else {
      const svg = renderToStaticMarkup(
        React.createElement(Icon, {
          name: key.icon,
          size: layout.iconSize,
          color: active ? '#86efac' : key.color,
        }),
      );
      ctx.drawImage(
        await image('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)),
        (144 - layout.iconSize) / 2,
        layout.iconY,
        layout.iconSize,
        layout.iconSize,
      );
    }
    ctx.fillStyle = '#f8f8ff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (key.image && layout.lines.length) {
      ctx.fillStyle = '#0009';
      ctx.fillRect(0, layout.textTop - 4, 144, 148 - layout.textTop);
      ctx.fillStyle = '#fff';
    }
    if (stacked) {
      stacked.lines.forEach((line, i) => {
        const y = layout.textTop + (i + 0.5) * layout.lineHeight;
        if (!line.scroll) {
          ctx.fillText(line.text, 72, y);
          return;
        }
        ctx.save();
        ctx.beginPath();
        ctx.rect(8, layout.textTop + i * layout.lineHeight, 128, layout.lineHeight);
        ctx.clip();
        ctx.textAlign = 'left';
        const x = 8 - line.scroll.offset;
        ctx.fillText(line.text, x, y);
        ctx.fillText(line.text, x + line.scroll.width + line.scroll.gap, y);
        ctx.restore();
      });
    } else if (scroll) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(8, layout.textTop, 128, layout.lineHeight);
      ctx.clip();
      ctx.textAlign = 'left';
      const x = 8 - scroll.offset,
        y = layout.textTop + layout.lineHeight / 2;
      ctx.fillText(scroll.text, x, y);
      ctx.fillText(scroll.text, x + scroll.width + scroll.gap, y);
      ctx.restore();
    } else
      layout.lines.forEach((line, i) =>
        ctx.fillText(line, 72, layout.textTop + (i + 0.5) * layout.lineHeight),
      );
    if (active) {
      ctx.fillStyle = '#86efac';
      ctx.beginPath();
      ctx.arc(130, 12, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return canvas.toDataURL('image/png');
}
