import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import type { SharpConstructor } from '../node_modules/sharp/dist/index.d.mts';

import { prepareHomepageHeroUpload } from '../lib/homepage/hero-media';
import {
  readMp4DurationSeconds,
  readMp4Metadata,
} from '../lib/homepage/mp4-metadata';

const typedSharp = sharp as SharpConstructor;

function blobBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function box(kind: string, body: Uint8Array, large = false): Buffer {
  const header = large ? 16 : 8;
  const result = Buffer.alloc(header + body.length);
  if (large) {
    result.writeUInt32BE(1, 0);
    result.write(kind, 4, 4, 'ascii');
    result.writeBigUInt64BE(BigInt(result.length), 8);
  } else {
    result.writeUInt32BE(result.length, 0);
    result.write(kind, 4, 4, 'ascii');
  }
  result.set(body, header);
  return result;
}

function movieHeader(seconds: number, version: 0 | 1 = 0): Buffer {
  const body = Buffer.alloc(version === 1 ? 112 : 100);
  body[0] = version;
  if (version === 1) {
    body.writeUInt32BE(1_000, 20);
    body.writeBigUInt64BE(BigInt(seconds * 1_000), 24);
  } else {
    body.writeUInt32BE(1_000, 12);
    body.writeUInt32BE(seconds * 1_000, 16);
  }
  return body;
}

function trackHeader(width: number, height: number): Buffer {
  const body = Buffer.alloc(84);
  body.writeUInt32BE(width * 65_536, 76);
  body.writeUInt32BE(height * 65_536, 80);
  return body;
}

function clip(
  seconds: number,
  options: { largeMovie?: boolean; durationVersion?: 0 | 1 } = {},
): Buffer {
  const duration = movieHeader(seconds, options.durationVersion ?? 0);
  const handler = Buffer.concat([
    Buffer.alloc(8),
    Buffer.from('vide'),
    Buffer.alloc(12),
  ]);
  const media = box(
    'mdia',
    Buffer.concat([box('mdhd', duration), box('hdlr', handler)]),
  );
  const track = box(
    'trak',
    Buffer.concat([box('tkhd', trackHeader(1920, 1080)), media]),
  );
  return Buffer.concat([
    box('ftyp', Buffer.from('isom\0\0\0\0isommp42')),
    box(
      'moov',
      Buffer.concat([box('mvhd', duration), track]),
      options.largeMovie,
    ),
    box('mdat', Buffer.alloc(8)),
  ]);
}

async function imageFile(
  format: 'jpeg' | 'png' | 'webp',
  type: string,
  options: { width?: number; height?: number; metadata?: boolean } = {},
) {
  let pipeline = typedSharp({
    create: {
      width: options.width ?? 1200,
      height: options.height ?? 750,
      channels: 3,
      background: { r: 172, g: 104, b: 48 },
    },
  });
  if (options.metadata) pipeline = pipeline.withMetadata({ exif: { IFD0: { Artist: 'Private Artist' } } });
  const bytes = await pipeline[format]().toBuffer();
  return new File([blobBytes(bytes)], `hero.${format === 'jpeg' ? 'jpg' : format}`, {
    type,
  });
}

void test('MP4 metadata accepts bounded 32-bit and 64-bit boxes', () => {
  assert.equal(readMp4DurationSeconds(clip(12)), 12);
  assert.deepEqual(readMp4Metadata(clip(10, { largeMovie: true, durationVersion: 1 })), {
    durationSeconds: 10,
    width: 1920,
    height: 1080,
  });
});

void test('MP4 metadata rejects malformed, overflowing, incomplete, and overlong movies', () => {
  const overflow = Buffer.alloc(16);
  overflow.writeUInt32BE(1, 0);
  overflow.write('ftyp', 4, 4, 'ascii');
  overflow.writeBigUInt64BE(BigInt('4294967296'), 8);
  assert.throws(() => readMp4DurationSeconds(overflow), /invalid MP4/i);
  assert.throws(() => readMp4DurationSeconds(Buffer.from('not a movie')), /invalid MP4/i);
  assert.throws(
    () =>
      readMp4DurationSeconds(
        Buffer.concat([
          box('ftyp', Buffer.from('isom\0\0\0\0isom')),
          box('moov', box('free', Buffer.alloc(8))),
          box('mdat', Buffer.alloc(8)),
        ]),
      ),
    /duration/i,
  );
  assert.throws(() => readMp4DurationSeconds(clip(16)), /15 seconds/i);
});

void test('JPEG PNG and WebP inputs normalize to metadata-free bounded WebP', async () => {
  for (const [format, type] of [
    ['jpeg', 'image/jpeg'],
    ['png', 'image/png'],
    ['webp', 'image/webp'],
  ] as const) {
    const prepared = await prepareHomepageHeroUpload(
      await imageFile(format, type, { metadata: true }),
    );
    assert.equal(prepared.mimeType, 'image/webp');
    assert.equal(prepared.width, 1200);
    assert.equal(prepared.height, 750);
    assert.equal(prepared.durationSeconds, null);
    const metadata = await typedSharp(prepared.bytes).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.icc, undefined);
  }
});

void test('image validation rejects spoofed malformed oversized and excessive inputs', async () => {
  await assert.rejects(
    prepareHomepageHeroUpload(await imageFile('png', 'image/jpeg')),
    /does not match/i,
  );
  await assert.rejects(
    prepareHomepageHeroUpload(
      new File([Buffer.from('not an image')], 'fake.png', { type: 'image/png' }),
    ),
    /safely read/i,
  );
  await assert.rejects(
    prepareHomepageHeroUpload(
      new File([Buffer.alloc(8 * 1024 * 1024 + 1)], 'large.png', {
        type: 'image/png',
      }),
    ),
    /8 MB/i,
  );
  await assert.rejects(
    prepareHomepageHeroUpload(
      await imageFile('png', 'image/png', { width: 9001, height: 10 }),
    ),
    /dimensions/i,
  );
  await assert.rejects(
    prepareHomepageHeroUpload(
      await imageFile('png', 'image/png', { width: 5000, height: 5000 }),
    ),
    /20 million pixels/i,
  );
});

void test('bounded MP4 upload preserves bytes and reports trusted metadata', async () => {
  const bytes = clip(12);
  const prepared = await prepareHomepageHeroUpload(
    new File([blobBytes(bytes)], 'workshop.mp4', { type: 'video/mp4' }),
  );
  assert.equal(prepared.mimeType, 'video/mp4');
  assert.equal(prepared.durationSeconds, 12);
  assert.equal(prepared.width, 1920);
  assert.equal(prepared.height, 1080);
  assert.deepEqual(Buffer.from(prepared.bytes), bytes);
});

void test('video validation rejects spoofed malformed overlong and oversized uploads', async () => {
  await assert.rejects(
    prepareHomepageHeroUpload(
      new File([blobBytes(clip(10))], 'movie.bin', {
        type: 'application/octet-stream',
      }),
    ),
    /supported image or MP4/i,
  );
  await assert.rejects(
    prepareHomepageHeroUpload(
      new File([Buffer.from('junk')], 'movie.mp4', { type: 'video/mp4' }),
    ),
    /invalid MP4/i,
  );
  await assert.rejects(
    prepareHomepageHeroUpload(
      new File([blobBytes(clip(16))], 'long.mp4', { type: 'video/mp4' }),
    ),
    /15 seconds/i,
  );
  await assert.rejects(
    prepareHomepageHeroUpload(
      new File([Buffer.alloc(20 * 1024 * 1024 + 1)], 'large.mp4', {
        type: 'video/mp4',
      }),
    ),
    /20 MB/i,
  );
});
