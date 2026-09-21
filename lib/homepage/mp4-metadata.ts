export type Mp4Metadata = Readonly<{
  durationSeconds: number;
  width: number;
  height: number;
}>;

type Box = Readonly<{
  kind: string;
  body: number;
  end: number;
}>;

const acceptedBrands = new Set([
  'isom',
  'iso2',
  'mp41',
  'mp42',
  'avc1',
  'M4V ',
]);

function invalid(detail: string): Error {
  return new Error(`Invalid MP4 container: ${detail}.`);
}

function kindAt(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3],
  );
}

function boxReader(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let count = 0;
  return function boxes(start: number, end: number): readonly Box[] {
    if (start < 0 || end < start || end > bytes.length) throw invalid('box bounds');
    const result: Box[] = [];
    for (let at = start; at < end; ) {
      if (++count > 10_000 || end - at < 8) throw invalid('box header');
      let size = view.getUint32(at);
      const kind = kindAt(bytes, at + 4);
      let header = 8;
      if (size === 1) {
        if (end - at < 16) throw invalid('large box header');
        const large = view.getBigUint64(at + 8);
        if (large > BigInt(Number.MAX_SAFE_INTEGER)) {
          throw invalid('large box overflow');
        }
        size = Number(large);
        header = 16;
      } else if (size === 0) {
        size = end - at;
      }
      if (size < header || size > end - at) throw invalid('box size');
      result.push({ kind, body: at + header, end: at + size });
      at += size;
    }
    return Object.freeze(result);
  };
}

function durationSeconds(
  bytes: Uint8Array,
  view: DataView,
  box: Box,
): number {
  const version = bytes[box.body];
  if (version !== 0 && version !== 1) throw invalid('duration version');
  const minimum = version === 1 ? 32 : 20;
  if (box.end - box.body < minimum) throw invalid('duration metadata');
  const timescaleOffset = box.body + (version === 1 ? 20 : 12);
  const durationOffset = box.body + (version === 1 ? 24 : 16);
  const timescale = view.getUint32(timescaleOffset);
  const ticksBig =
    version === 1
      ? view.getBigUint64(durationOffset)
      : BigInt(view.getUint32(durationOffset));
  if (
    !timescale ||
    ticksBig <= BigInt(0) ||
    ticksBig > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    throw invalid('duration value');
  }
  const seconds = Number(ticksBig) / timescale;
  if (!Number.isFinite(seconds) || seconds <= 0) throw invalid('duration value');
  return seconds;
}

function videoDimensions(
  bytes: Uint8Array,
  view: DataView,
  box: Box,
): { width: number; height: number } {
  const version = bytes[box.body];
  if (version !== 0 && version !== 1) throw invalid('track header version');
  const widthOffset = box.body + (version === 1 ? 88 : 76);
  const heightOffset = widthOffset + 4;
  if (heightOffset + 4 > box.end) throw invalid('video dimensions');
  const width = view.getUint32(widthOffset) / 65_536;
  const height = view.getUint32(heightOffset) / 65_536;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 10_000 ||
    height > 10_000
  ) {
    throw invalid('video dimensions');
  }
  return { width, height };
}

export function readMp4Metadata(bytes: Uint8Array): Mp4Metadata {
  if (bytes.byteLength < 24 || bytes.byteLength > 20 * 1024 * 1024) {
    throw invalid('file size');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const boxes = boxReader(bytes);
  const top = boxes(0, bytes.length);
  const fileType = top.find((box) => box.kind === 'ftyp');
  const movies = top.filter((box) => box.kind === 'moov');
  if (
    !fileType ||
    fileType.end - fileType.body < 8 ||
    movies.length !== 1 ||
    !top.some((box) => box.kind === 'mdat' && box.end > box.body)
  ) {
    throw invalid('required boxes');
  }
  const brands: string[] = [];
  brands.push(kindAt(bytes, fileType.body));
  for (let at = fileType.body + 8; at + 4 <= fileType.end; at += 4) {
    brands.push(kindAt(bytes, at));
  }
  if (!brands.some((brand) => acceptedBrands.has(brand))) {
    throw invalid('unsupported file type');
  }

  const movieChildren = boxes(movies[0].body, movies[0].end);
  const headers = movieChildren.filter((box) => box.kind === 'mvhd');
  if (headers.length !== 1) throw invalid('movie duration');
  const movieDuration = durationSeconds(bytes, view, headers[0]);
  if (movieDuration > 15) {
    throw new RangeError('Homepage hero video must be 15 seconds or shorter.');
  }

  let dimensions: { width: number; height: number } | null = null;
  for (const track of movieChildren.filter((box) => box.kind === 'trak')) {
    const trackChildren = boxes(track.body, track.end);
    const media = trackChildren.filter((box) => box.kind === 'mdia');
    if (media.length !== 1) continue;
    const mediaChildren = boxes(media[0].body, media[0].end);
    const handler = mediaChildren.find((box) => box.kind === 'hdlr');
    if (!handler || handler.end - handler.body < 12) continue;
    if (kindAt(bytes, handler.body + 8) !== 'vide') continue;
    const trackHeaders = trackChildren.filter((box) => box.kind === 'tkhd');
    if (trackHeaders.length !== 1) throw invalid('video track header');
    const mediaDurations = mediaChildren.filter((box) => box.kind === 'mdhd');
    if (mediaDurations.length !== 1) throw invalid('video track duration');
    const trackDuration = durationSeconds(bytes, view, mediaDurations[0]);
    if (trackDuration > 15) {
      throw new RangeError('Homepage hero video must be 15 seconds or shorter.');
    }
    dimensions = videoDimensions(bytes, view, trackHeaders[0]);
    break;
  }
  if (!dimensions) throw invalid('video track');
  return Object.freeze({
    durationSeconds: Math.max(movieDuration, 0),
    width: dimensions.width,
    height: dimensions.height,
  });
}

export function readMp4DurationSeconds(bytes: Uint8Array): number {
  return readMp4Metadata(bytes).durationSeconds;
}
