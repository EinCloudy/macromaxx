import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

const background = [13, 14, 21];
const clamp = value => Math.max(0, Math.min(1, value));
const ease = value => { const t = clamp(value); return t * t * (3 - 2 * t); };

export function darkBuffer(width, height) {
  const buffer = Buffer.alloc(width * height * 3);
  buffer.fill(Buffer.from(background));
  return buffer;
}

function blend(from, target, width, height, progress, kind, direction) {
  if (progress >= 1) return target;
  const output = Buffer.alloc(target.length);
  const sign = direction === 'out' ? -1 : 1;
  const shift = kind === 'folder' ? Math.round((1 - progress) * width * 0.12) * sign : 0;
  const oldShift = kind === 'folder' ? -Math.round(progress * width * 0.08) * sign : 0;
  const scale = kind === 'reveal' ? 0.88 + progress * 0.12 : 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tx = Math.round((x - (width - 1) / 2 - shift) / scale + (width - 1) / 2);
      const ty = Math.round((y - (height - 1) / 2) / scale + (height - 1) / 2);
      const ox = x - oldShift;
      for (let channel = 0; channel < 3; channel++) {
        const oldValue = ox >= 0 && ox < width ? from[(y * width + ox) * 3 + channel] : background[channel];
        const newValue = tx >= 0 && tx < width && ty >= 0 && ty < height ? target[(ty * width + tx) * 3 + channel] : background[channel];
        output[(y * width + x) * 3 + channel] = Math.round(oldValue * (1 - progress) + newValue * progress);
      }
    }
  }
  return output;
}

export async function playIconTransition(deck, targets, sources, {
  kind, direction = 'in', signal, cache = new Map(), onFrame = () => {},
  now = () => performance.now(), wait = ms => sleep(ms, undefined, { signal }),
} = {}) {
  if (!targets.length || signal?.aborted) return;
  const frames = kind === 'reveal' ? 9 : 7;
  const frameMs = 40;
  const hash = createHash('sha1').update(`${kind}:${direction}`);
  const origins = new Map();
  for (const { control, buffer } of targets) {
    const { width, height } = control.pixelSize;
    const source = sources.get(control.index) || darkBuffer(width, height);
    origins.set(control.index, source);
    hash.update(`${control.index}:${width}x${height}:`).update(source).update(buffer);
  }
  const id = hash.digest('hex');
  let prepared = cache.get(id);
  if (!prepared) {
    const centerRow = (Math.min(...targets.map(t => t.control.row)) + Math.max(...targets.map(t => t.control.row))) / 2;
    const centerColumn = (Math.min(...targets.map(t => t.control.column)) + Math.max(...targets.map(t => t.control.column))) / 2;
    const distances = targets.map(t => Math.hypot(t.control.row - centerRow, t.control.column - centerColumn));
    const reach = Math.max(1, ...distances);
    prepared = [];
    for (let frame = 1; frame <= frames; frame++) {
      const packets = [];
      for (let index = 0; index < targets.length; index++) {
        if (signal?.aborted) return;
        const { control, buffer } = targets[index];
        const { width, height } = control.pixelSize;
        const time = frame / frames;
        const progress = frame === frames ? 1 : ease(kind === 'reveal' ? time * 1.45 - distances[index] / reach * 0.45 : time);
        const source = origins.get(control.index);
        const image = source.equals(buffer) ? buffer : blend(source, buffer, width, height, progress, kind, direction);
        const packet = await deck.prepareFillKeyBuffer(control.index, image, { format: 'rgb' });
        packets.push({ index: control.index, buffer: image, packet });
      }
      prepared.push(packets);
    }
    cache.set(id, prepared);
    if (cache.size > 6) cache.delete(cache.keys().next().value);
  }
  const displayed = new Map(origins);
  const start = now();
  for (let frame = 0; frame < prepared.length; frame++) {
    frame = Math.min(prepared.length - 1, Math.max(frame, Math.floor((now() - start) / frameMs)));
    for (const { index, buffer, packet } of prepared[frame]) {
      if (signal?.aborted) return;
      if (displayed.get(index)?.equals(buffer)) continue;
      await deck.sendPreparedBuffer(packet);
      displayed.set(index, buffer);
      onFrame(index, buffer);
    }
    const remaining = start + (frame + 1) * frameMs - now();
    if (remaining > 0 && frame < prepared.length - 1) await wait(remaining);
  }
}
