import { performance } from 'node:perf_hooks';
import { SCREENSAVERS, SCREENSAVER_GRAPHICS_PRESETS, screensaverBudget } from '../shared/screensaver.js';
import { ScreensaverRenderer } from '../electron/screensaver-renderer.js';

// CPU-only benchmark: includes scene generation, LCD scaling and comparison,
// but deliberately excludes USB transport/encoding and Electron's UI.
const results = [];
const preset = process.argv[2] || 'eco';
if (!SCREENSAVER_GRAPHICS_PRESETS.some(({ id }) => id === preset)) {
  throw new Error('Choose a graphics preset: eco, balanced, high, ultra.');
}
for (const count of [15, 32]) {
  const columns = count === 15 ? 5 : 8;
  const controls = Array.from({ length: count }, (_, index) => ({
    index, row: Math.floor(index / columns), column: index % columns,
    feedbackType: 'lcd', pixelSize: { width: 96, height: 96 },
  }));
  const budget = screensaverBudget({ screensaver: { performance: preset } }, count);
  const renderer = new ScreensaverRenderer(columns, count / columns, budget.tile, controls);
  for (const { id } of SCREENSAVERS) {
    const displayed = new Map();
    const frame = (n) => {
      renderer.draw(id, n / budget.fps);
      for (const control of controls) {
        const previous = displayed.get(control.index);
        const next = renderer.buffer(control, previous);
        if (!previous?.equals(next)) displayed.set(control.index, next);
      }
    };
    for (let n = 0; n < 10; n++) frame(n);
    const start = performance.now();
    for (let n = 0; n < 100; n++) frame(n);
    const ms = (performance.now() - start) / 100;
    results.push({ effect: id, keys: count, fps: budget.fps, 'CPU ms/frame': ms.toFixed(2),
      'render ms/second': (ms * budget.fps).toFixed(2) });
  }
}
console.table(results);
console.log(`CPU-only, ${preset} preset; actual USB/encoding cost and desktop load are not included.`);
