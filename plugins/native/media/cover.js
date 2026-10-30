import { open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const maxBytes = 5 * 1024 * 1024;

// OS artwork can be a local file, a remote URL or inline Windows/macOS data.
// Bound both the input and decoded dimensions before handing it to the renderer.
export async function loadCover(value) {
  try {
    let bytes;
    if (value.startsWith('data:')) {
      if (value.length > Math.ceil(maxBytes / 3) * 4 + 128) return '';
      const match = /^data:image\/[\w.+-]+;base64,([A-Za-z0-9+/=\r\n]+)$/.exec(value);
      if (!match) return '';
      bytes = Buffer.from(match[1], 'base64');
      if (bytes.length > maxBytes) return '';
    } else {
      const url = new URL(value);
      if (url.protocol === 'file:') {
        const file = await open(fileURLToPath(url), 'r');
        try {
          const stat = await file.stat();
          if (!stat.isFile() || stat.size > maxBytes) return '';
          const buffer = Buffer.alloc(stat.size + 1);
          const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
          if (bytesRead > maxBytes) return '';
          bytes = buffer.subarray(0, bytesRead);
        } finally { await file.close(); }
      } else if (url.protocol === 'http:' || url.protocol === 'https:') {
        const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!response.ok || Number(response.headers.get('content-length')) > maxBytes || !response.body) {
          await response.body?.cancel().catch(() => {});
          return '';
        }
        const chunks = []; let size = 0;
        for await (const chunk of response.body) {
          size += chunk.length;
          if (size > maxBytes) return '';
          chunks.push(chunk);
        }
        bytes = Buffer.concat(chunks);
      } else return '';
    }
    const image = await sharp(bytes, { limitInputPixels: 20000000 }).resize(256, 256, { fit: 'cover' }).png().toBuffer();
    return 'data:image/png;base64,' + image.toString('base64');
  } catch { return ''; }
}
