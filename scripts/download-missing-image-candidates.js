import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(__dirname, '..', 'products', '.missing-image-candidates');
fs.mkdirSync(out, { recursive: true });

const candidates = [
  ['product18-04.jpg', 'https://m.media-amazon.com/images/I/412HH5HUlIL.jpg'],
  ['product18-05.jpg', 'https://m.media-amazon.com/images/I/51-ES5WJurL.jpg'],
  ['product18-06.jpg', 'https://m.media-amazon.com/images/I/41oMBrGWbnL.jpg'],
  ['product18-07.jpg', 'https://m.media-amazon.com/images/I/41GJvaUB0mL.jpg'],
  ['product20-02.jpg', 'https://m.media-amazon.com/images/I/41rzRV6yAsL.jpg'],
];

for (const [name, url] of candidates) {
  const response = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const type = response.headers.get('content-type') || '';
  if (!type.startsWith('image/')) throw new Error(`Rejected non-image ${type} from ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(path.join(out, name), bytes);
  console.log(JSON.stringify({ name, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }));
}
