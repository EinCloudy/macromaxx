import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Icon } from './icons.jsx';
import { visualSignature } from '../shared/visuals.js';
const cache = new Map();
async function image(src) { return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; }); }
export function renderKey(key, active = false) {
  const signature = visualSignature(key, active);
  if (!cache.has(signature)) {
    const pending = drawKey(key, active).catch(error => { cache.delete(signature); throw error; });
    cache.set(signature, pending);
    if (cache.size > 2048) cache.delete(cache.keys().next().value);
  }
  return cache.get(signature);
}
async function drawKey(key, active) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 144; const ctx = canvas.getContext('2d');
  ctx.fillStyle = key?.background || '#17181d'; ctx.fillRect(0, 0, 144, 144);
  if (key) {
    if (key.image) ctx.drawImage(await image(key.image), 0, 0, 144, 144);
    else {
      const svg = renderToStaticMarkup(React.createElement(Icon, { name: key.icon, size: 52, color: active ? '#86efac' : key.color }));
      ctx.drawImage(await image('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)), 46, 27, 52, 52);
    }
    ctx.fillStyle = '#f8f8ff'; ctx.font = '500 16px sans-serif'; ctx.textAlign = 'center';
    const text = key.label || ''; const words = text.split(' '); let line = '', lines = [];
    for (const word of words) { if (ctx.measureText(line + ' ' + word).width > 128 && line) { lines.push(line); line = word; } else line = line ? line + ' ' + word : word; } lines.push(line);
    if (key.image) { ctx.fillStyle = '#0009'; ctx.fillRect(0, 96, 144, 48); ctx.fillStyle = '#fff'; }
    lines.slice(0, 2).forEach((line, i) => ctx.fillText(line, 72, 115 + i * 19, 132));
    if (active) { ctx.fillStyle = '#86efac'; ctx.beginPath(); ctx.arc(130, 12, 5, 0, Math.PI * 2); ctx.fill(); }
  }
  return canvas.toDataURL('image/png');
}
