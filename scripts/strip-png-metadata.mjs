import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const visualChunks = new Set([
  'IHDR',
  'PLTE',
  'IDAT',
  'IEND',
  'tRNS',
  'cHRM',
  'gAMA',
  'iCCP',
  'sBIT',
  'sRGB',
  'bKGD',
  'hIST',
  'pHYs',
  'sPLT',
  'acTL',
  'fcTL',
  'fdAT',
]);

function parsePng(buffer) {
  if (!buffer.subarray(0, pngSignature.length).equals(pngSignature)) {
    throw new Error('The input is not a valid PNG file.');
  }

  const chunks = [];
  let offset = pngSignature.length;
  while (offset < buffer.length) {
    if (offset + 12 > buffer.length) throw new Error('The PNG is truncated.');
    const dataLength = buffer.readUInt32BE(offset);
    const end = offset + 12 + dataLength;
    if (end > buffer.length) throw new Error('A PNG chunk is truncated.');
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    chunks.push({ type, bytes: buffer.subarray(offset, end) });
    offset = end;
    if (type === 'IEND') break;
  }
  return chunks;
}

function imageDataHash(chunks) {
  const hash = createHash('sha256');
  for (const chunk of chunks) {
    if (chunk.type === 'IDAT' || chunk.type === 'fdAT') hash.update(chunk.bytes);
  }
  return hash.digest('hex');
}

const input = process.argv[2];
if (!input) throw new Error('Pass the PNG file path to sanitize.');

const file = resolve(input);
const source = await readFile(file);
const sourceChunks = parsePng(source);
const keptChunks = sourceChunks.filter((chunk) => visualChunks.has(chunk.type));
const output = Buffer.concat([pngSignature, ...keptChunks.map((chunk) => chunk.bytes)]);

if (imageDataHash(sourceChunks) !== imageDataHash(parsePng(output))) {
  throw new Error('Image pixels changed while removing metadata.');
}

await writeFile(file, output);
const removed = sourceChunks
  .filter((chunk) => !visualChunks.has(chunk.type))
  .map((chunk) => chunk.type);
console.log(
  `Removed ${removed.length} metadata chunk(s): ${removed.join(', ') || 'none'}`,
);
console.log(`Reduced ${source.length} bytes to ${output.length} bytes without changing image data.`);
