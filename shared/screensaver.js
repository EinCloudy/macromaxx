export const SCREENSAVERS = [
  { id: 'matrix', name: 'Matrix rain' },
  { id: 'snake', name: 'Neon snake' },
  { id: 'stars', name: 'Star flight' },
  { id: 'plasma', name: 'Plasma waves' },
  { id: 'bounce', name: 'Bouncing ball' },
  { id: 'aurora', name: 'Northern lights' },
  { id: 'fireflies', name: 'Fireflies' },
  { id: 'radar', name: 'Radar sweep' },
  { id: 'rain', name: 'Neon rain' },
  { id: 'ripples', name: 'Water ripples' },
  { id: 'orbits', name: 'Orbital trails' },
  { id: 'underwater', name: 'Underwater' },
];
export const SCREENSAVER_GRAPHICS_PRESETS = [
  {
    id: 'eco',
    name: 'Eco',
    tile: 24,
    fps: 5,
    updates: 100,
    description: 'Lowest CPU and USB usage.',
  },
  {
    id: 'balanced',
    name: 'Balanced',
    tile: 40,
    fps: 10,
    updates: 200,
    description: 'A balance of detail and resource usage.',
  },
  {
    id: 'high',
    name: 'High',
    tile: 56,
    fps: 15,
    updates: 300,
    description: 'Sharper scenes and smoother motion.',
  },
  {
    id: 'ultra',
    name: 'Ultra',
    tile: 72,
    fps: 20,
    updates: 400,
    description: 'Maximum detail and motion; higher CPU and USB usage.',
  },
];
export const DEFAULT_SCREENSAVER = {
  enabled: false,
  effect: 'matrix',
  timeout: 300,
  performance: 'eco',
};
export function screensaverSettings(settings = {}) {
  const resolved = { ...DEFAULT_SCREENSAVER, ...settings.screensaver };
  // Preserve the previous Smooth mode when opening older workspaces.
  if (resolved.performance === 'smooth') resolved.performance = 'balanced';
  return resolved;
}

const fract = (n) => n - Math.floor(n);
const hash = (n) => {
  let v = Math.imul(n | 0, 374761393) + 668265263;
  v = Math.imul(v ^ (v >>> 13), 1274126177);
  return ((v ^ (v >>> 16)) >>> 0) / 4294967296;
};

export function screensaverBudget(settings, count = 15) {
  const id = screensaverSettings(settings).performance;
  const preset =
    SCREENSAVER_GRAPHICS_PRESETS.find((item) => item.id === id) || SCREENSAVER_GRAPHICS_PRESETS[0];
  // Limit total USB updates as well as scene resolution on larger decks.
  return {
    tile: preset.tile,
    fps: Math.min(preset.fps, preset.updates / Math.max(1, count)),
  };
}

// A continuous RGB scene, shared by the hardware and the settings preview.
export function screensaverFrame(
  effect,
  width,
  height,
  time,
  pixels = new Uint8Array(width * height * 3),
) {
  if (pixels.length !== width * height * 3) throw new Error('Invalid screensaver buffer size.');
  pixels.fill(0);
  const put = (x, y, r, g, b) => {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 3;
    pixels[i] = Math.max(0, Math.min(255, r));
    pixels[i + 1] = Math.max(0, Math.min(255, g));
    pixels[i + 2] = Math.max(0, Math.min(255, b));
  };
  const dot = (cx, cy, radius, r, g, b) => {
    const radiusSquared = radius * radius;
    for (let y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(height - 1, cy + radius); y++)
      for (
        let x = Math.max(0, Math.floor(cx - radius));
        x <= Math.min(width - 1, cx + radius);
        x++
      ) {
        const glow = Math.max(0, 1 - ((x - cx) ** 2 + (y - cy) ** 2) / radiusSquared);
        if (glow) put(x, y, r * glow, g * glow, b * glow);
      }
  };
  if (effect === 'matrix') {
    const cell = Math.max(5, Math.floor(width / 45));
    const rows = Math.ceil(height / cell);
    for (let col = 0; col < width / cell; col++) {
      const head = (time * (5 + hash(col) * 9) + hash(col + 90) * rows) % (rows + 12);
      for (let row = 0; row < rows; row++) {
        const age = (head - row + rows + 12) % (rows + 12);
        if (age > 11) continue;
        const light = 1 - age / 12;
        const glyph = Math.floor(time * 4 + row * 31 + col * 73);
        for (let y = 1; y < cell - 1; y++)
          for (let x = 1; x < cell - 1; x++) {
            if (hash(glyph + y * 7 + x * 13) > 0.48)
              put(
                col * cell + x,
                row * cell + y,
                age < 1 ? 190 : 15,
                255 * light,
                age < 1 ? 200 : 65 * light,
              );
          }
      }
    }
  } else if (effect === 'snake') {
    const cols = 20,
      rows = 12,
      total = cols * rows;
    const head = Math.floor(time * 14) % total;
    for (let tail = 30; tail >= 0; tail--) {
      const n = (head - tail + total) % total;
      const row = Math.floor(n / cols);
      const col = row % 2 ? cols - 1 - (n % cols) : n % cols;
      const glow = 1 - tail / 36;
      for (let y = 1; y < height / rows - 1; y++)
        for (let x = 1; x < width / cols - 1; x++)
          put(
            (col * width) / cols + x,
            (row * height) / rows + y,
            tail ? 45 * glow : 235,
            240 * glow,
            170 * glow,
          );
    }
  } else if (effect === 'stars') {
    for (let n = 0; n < 110; n++) {
      const z = 0.08 + fract(hash(n) - time * 0.15) * 0.92;
      const x = width / 2 + ((hash(n + 300) - 0.5) * width) / z;
      const y = height / 2 + ((hash(n + 600) - 0.5) * height) / z;
      const light = (1 - z) * 255;
      const size = z < 0.3 ? 3 : 1;
      for (let dy = 0; dy < size; dy++)
        for (let dx = 0; dx < size; dx++) put(x + dx, y + dy, light * 0.8, light * 0.9, light);
    }
  } else if (effect === 'plasma') {
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const v =
          Math.sin((x / width) * 10 + time) +
          Math.sin((y / height) * 9 - time * 0.8) +
          Math.sin(Math.hypot(x / width - 0.5, y / height - 0.5) * 18 - time * 1.5);
        put(
          x,
          y,
          125 + 110 * Math.sin(v + time * 0.3),
          90 + 80 * Math.sin(v + 2),
          145 + 110 * Math.sin(v + 4),
        );
      }
  } else if (effect === 'bounce') {
    const radius = Math.min(width, height) * 0.09;
    const bounce = (v) => 1 - Math.abs((v % 2) - 1);
    const cx = radius + bounce(time * 0.31) * (width - radius * 2);
    const cy = radius + bounce(time * 0.47) * (height - radius * 2);
    dot(cx, cy, radius * 2, 180, 130, 255);
  } else if (effect === 'aurora') {
    for (let x = 0; x < width; x++) {
      const center =
        height *
        (0.45 +
          0.16 * Math.sin((x / width) * 9 + time * 0.4) +
          0.08 * Math.sin((x / width) * 18 - time * 0.7));
      const spread = height * 0.22;
      for (
        let y = Math.max(0, Math.floor(center - spread));
        y < Math.min(height, center + spread);
        y++
      ) {
        const light = (1 - Math.abs(y - center) / spread) ** 2;
        put(x, y, 45 * light, 220 * light, (150 + 80 * Math.sin((x / width) * 4 + time)) * light);
      }
    }
  } else if (effect === 'fireflies') {
    for (let n = 0; n < 24; n++) {
      const x = width * fract(hash(n) + Math.sin(time * 0.25 + n) * 0.12);
      const y = height * fract(hash(n + 100) + Math.cos(time * 0.3 + n * 2) * 0.15);
      const light = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(time * 1.5 + n));
      dot(x, y, Math.max(2, height * 0.04), 180 * light, 255 * light, 70 * light);
    }
  } else if (effect === 'radar') {
    const cx = width / 2,
      cy = height / 2,
      radius = Math.min(width, height) * 0.45;
    for (let ring = 1; ring <= 3; ring++)
      for (let n = 0; n < 160; n++) {
        const a = (n / 160) * Math.PI * 2;
        put(
          cx + (Math.cos(a) * radius * ring) / 3,
          cy + (Math.sin(a) * radius * ring) / 3,
          0,
          45,
          25,
        );
      }
    for (let trail = 18; trail >= 0; trail--) {
      const angle = time * 0.8 - trail * 0.025;
      for (let r = 0; r < radius; r++)
        put(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r, 20, 240 * (1 - trail / 20), 100);
    }
    for (let n = 0; n < 7; n++) {
      const angle = hash(n + 60) * Math.PI * 2;
      const age = fract((time * 0.8 - angle) / (Math.PI * 2));
      const r = radius * (0.2 + hash(n + 80) * 0.7);
      dot(
        cx + Math.cos(angle) * r,
        cy + Math.sin(angle) * r,
        2,
        100 * (1 - age),
        255 * (1 - age),
        80 * (1 - age),
      );
    }
  } else if (effect === 'rain') {
    for (let n = 0; n < 45; n++) {
      const x = hash(n + 20) * width;
      const y = fract(hash(n + 80) + time * (0.2 + hash(n) * 0.3)) * (height + 20);
      for (let tail = 0; tail < 10; tail++)
        put(x + tail * 0.25, y - tail, 80 - tail * 6, 170 - tail * 12, 255 - tail * 20);
    }
  } else if (effect === 'ripples') {
    for (let n = 0; n < 5; n++) {
      const phase = fract(time * 0.18 + n / 5);
      const cycle = Math.floor(time * 0.18 + n / 5);
      const cx = width * hash(n + cycle * 5),
        cy = height * hash(n + cycle * 5 + 90);
      const radius = phase * Math.min(width, height) * 0.65;
      const steps = Math.max(16, Math.ceil(radius * 7));
      for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * Math.PI * 2;
        put(
          cx + Math.cos(angle) * radius,
          cy + Math.sin(angle) * radius,
          60 * (1 - phase),
          170 * (1 - phase),
          255 * (1 - phase),
        );
      }
    }
  } else if (effect === 'underwater') {
    // Column-based lighting avoids per-pixel trigonometry even at Ultra quality.
    for (let x = 0; x < width; x++) {
      const rays = Math.max(0, Math.sin((x / width) * 22 + time * 0.3)) ** 6;
      for (let y = 0; y < height; y++) {
        const depth = y / height;
        const light = rays * (1 - depth) * 38;
        put(x, y, 3 + light * 0.2, 65 - depth * 45 + light, 115 - depth * 70 + light);
      }
    }
    // Swaying kelp silhouettes and a low, gently undulating seabed.
    for (let n = 0; n < 18; n++) {
      const base = hash(n + 400) * width;
      const length = height * (0.08 + hash(n + 450) * 0.22);
      for (let y = 0; y < length; y++) {
        const sway = Math.sin((y / Math.max(1, length)) * 3 + time * 0.7 + n) * y * 0.13;
        put(base + sway, height - 1 - y, 6, 75 + (y / length) * 30, 65);
        put(base + sway + 1, height - 1 - y, 6, 65, 60);
      }
    }
    for (let x = 0; x < width; x++) {
      const top = height * 0.96 + Math.sin((x / width) * 12) * height * 0.015;
      for (let y = Math.floor(top); y < height; y++) put(x, y, 25, 65, 68);
    }
    // Small schools of fish, including tails and a contrasting eye.
    const size = Math.max(2, height * 0.026);
    for (let n = 0; n < 9; n++) {
      const direction = n % 2 ? -1 : 1;
      const phase = fract(hash(n + 500) + time * (0.025 + hash(n) * 0.025));
      const cx = (direction > 0 ? phase : 1 - phase) * (width + size * 8) - size * 4;
      const cy = height * (0.2 + hash(n + 550) * 0.5) + Math.sin(time + n) * size;
      const color = n % 3 ? [55, 185, 205] : [235, 180, 85];
      for (let y = -Math.ceil(size); y <= size; y++)
        for (let x = -Math.ceil(size * 2); x <= size * 2; x++) {
          if ((x * x) / (size * size * 4) + (y * y) / (size * size) <= 1)
            put(cx + x, cy + y, ...color);
        }
      for (let tail = 0; tail < size; tail++)
        for (let y = -tail; y <= tail; y++)
          put(cx - direction * (size * 1.5 + tail), cy + y, ...color);
      put(cx + direction * size, cy - size * 0.2, 5, 30, 40);
    }
    for (let n = 0; n < 16; n++) {
      const phase = fract(hash(n + 650) + time * (0.035 + hash(n) * 0.035));
      const cx = hash(n + 600) * width + Math.sin(time * 0.6 + n) * size;
      const cy = (1 - phase) * (height + size * 4) - size * 2;
      const radius = Math.max(1, size * (0.25 + hash(n + 700) * 0.5));
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        put(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, 80, 155, 185);
      }
    }
  } else if (effect === 'orbits') {
    for (let n = 0; n < 4; n++)
      for (let tail = 28; tail >= 0; tail--) {
        const angle = time * (0.5 + n * 0.15) + n * 1.6 - tail * 0.035;
        const x = width / 2 + Math.cos(angle) * width * (0.15 + n * 0.07);
        const y = height / 2 + Math.sin(angle * (n % 2 ? -1 : 1)) * height * (0.15 + n * 0.07);
        const light = 1 - tail / 30;
        dot(x, y, tail ? 1.2 : 2.5, (100 + n * 45) * light, (230 - n * 35) * light, 255 * light);
      }
  }
  return pixels;
}
