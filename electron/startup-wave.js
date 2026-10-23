import sharp from 'sharp';
import { setTimeout as sleep } from 'node:timers/promises';

// Use the actual grid rather than model names: odd grids have one origin,
// while even grids (e.g. the XL's 8 × 4 keys) expand around their centre.
export function createWavePlan(controls, { frameCount = 28, fps = 20, levels = 20, reverse = false } = {}) {
  const buttons = controls.filter(control => control.type === 'button' && control.feedbackType === 'lcd');
  if (!buttons.length) return { frames: [], frameMs: 1000 / fps };
  const center = {
    row: (Math.min(...buttons.map(c => c.row)) + Math.max(...buttons.map(c => c.row))) / 2,
    column: (Math.min(...buttons.map(c => c.column)) + Math.max(...buttons.map(c => c.column))) / 2,
  };
  const distances = buttons.map(c => Math.hypot(c.row - center.row, c.column - center.column));
  const reach = Math.max(...distances);
  const width = 1.15;
  const frames = Array.from({ length: frameCount }, (_, frame) => {
    const radius = (frame - 1) / (frameCount - 3) * (reach + width * 1.8);
    return buttons.map((control, index) => {
      const pulse = Math.exp(-2.6 * ((distances[index] - radius) / width) ** 2);
      const level = frame === 0 || frame === frameCount - 1 ? 0 : Math.round(pulse * levels);
      return { control, level };
    });
  });
  return { frames: reverse ? frames.reverse() : frames, frameMs: 1000 / fps, center, levels };
}

async function glowImage(width, height, level, levels) {
  const strength = level / levels;
  const mix = (dark, light) => Math.round(dark + (light - dark) * strength);
  const color = `rgb(${mix(13, 181)},${mix(14, 143)},${mix(21, 255)})`;
  const highlight = `rgb(${mix(13, 231)},${mix(14, 215)},${mix(21, 255)})`;
  const rim = `rgb(${mix(13, 126)},${mix(14, 104)},${mix(21, 210)})`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><radialGradient id="glow" cx="50%" cy="42%" r="72%">
      <stop offset="0" stop-color="${highlight}"/>
      <stop offset="0.55" stop-color="${color}"/>
      <stop offset="1" stop-color="${rim}"/>
    </radialGradient></defs>
    <rect width="100%" height="100%" fill="url(#glow)"/>
  </svg>`;
  return sharp(Buffer.from(svg)).removeAlpha().raw().toBuffer();
}

export async function playStartupWave(deck, controls, {
  signal, reverse = false, now = () => performance.now(), wait = ms => sleep(ms, undefined, { signal }),
} = {}) {
  const plan = createWavePlan(controls, { reverse });
  if (!plan.frames.length || signal?.aborted) return;
  const palette = new Map();
  const prepared = new Map();

  // Encode USB packets before playback. Shared intensity levels reuse artwork;
  // prepared packets retain their key index and need no JPEG encoding per frame.
  for (const frame of plan.frames) {
    for (const { control, level } of frame) {
      if (signal?.aborted) return;
      const key = `${control.index}:${level}`;
      if (prepared.has(key)) continue;
      const { width, height } = control.pixelSize;
      const color = `${width}x${height}:${level}`;
      if (!palette.has(color)) palette.set(color, await glowImage(width, height, level, plan.levels));
      const packet = await deck.prepareFillKeyBuffer(control.index, palette.get(color), { format: 'rgb' });
      prepared.set(key, packet);
    }
  }

  const sent = new Map();
  const start = now();
  for (let index = 0; index < plan.frames.length; index++) {
    if (signal?.aborted) return;
    // Slow USB links skip late frames instead of extending the startup delay.
    index = Math.min(plan.frames.length - 1, Math.max(index, Math.floor((now() - start) / plan.frameMs)));
    for (const { control, level } of plan.frames[index]) {
      if (signal?.aborted) return;
      if (sent.get(control.index) === level) continue;
      await deck.sendPreparedBuffer(prepared.get(`${control.index}:${level}`));
      sent.set(control.index, level);
    }
    const remaining = start + (index + 1) * plan.frameMs - now();
    if (remaining > 0 && index < plan.frames.length - 1) await wait(remaining);
  }
}
