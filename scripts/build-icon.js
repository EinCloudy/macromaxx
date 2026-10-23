import fs from 'node:fs/promises';
import sharp from 'sharp';
await fs.mkdir('build', { recursive: true });
await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" rx="120" fill="#b49aff"/><path d="M282 94 139 285h108l-18 133 144-195H265z" fill="none" stroke="#251c36" stroke-width="25" stroke-linejoin="round"/></svg>')).png().toFile('build/icon.png');
