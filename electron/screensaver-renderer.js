import { screensaverFrame } from '../shared/screensaver.js';

// No image codecs/resizers in the steady-state animation path. Each LCD has
// two reusable output buffers, so the currently displayed source stays intact.
export class ScreensaverRenderer {
  constructor(columns, rows, tile, controls) {
    this.width = columns * tile;
    this.height = rows * tile;
    this.tile = tile;
    this.scene = new Uint8Array(this.width * this.height * 3);
    this.tiles = new Map(controls.filter(c => c.feedbackType === 'lcd').map(control => {
      const { width, height } = control.pixelSize;
      const offsets = new Uint32Array(width * height);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        offsets[y * width + x] = ((control.row * tile + Math.floor(y * tile / height)) * this.width + control.column * tile + Math.floor(x * tile / width)) * 3;
      }
      return [control.index, { offsets, buffers: [Buffer.alloc(width * height * 3), Buffer.alloc(width * height * 3)] }];
    }));
  }

  draw(effect, time) {
    screensaverFrame(effect, this.width, this.height, time, this.scene);
  }

  buffer(control, displayed) {
    const { offsets, buffers } = this.tiles.get(control.index);
    const output = displayed === buffers[0] ? buffers[1] : buffers[0];
    for (let n = 0, j = 0; n < offsets.length; n++, j += 3) {
      const i = offsets[n];
      output[j] = this.scene[i]; output[j + 1] = this.scene[i + 1]; output[j + 2] = this.scene[i + 2];
    }
    return output;
  }

  color(control) {
    const i = ((control.row * this.tile + Math.floor(this.tile / 2)) * this.width + control.column * this.tile + Math.floor(this.tile / 2)) * 3;
    return this.scene.subarray(i, i + 3);
  }
}
