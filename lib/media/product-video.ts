export const maximumProductVideoBytes = 20 * 1024 * 1024;
export const maximumProductVideoSeconds = 60;
/** Bounded movie/video-track metadata validation; not codec decoding or malware scanning. */
export async function validateProductVideo(file: File): Promise<string | null> {
  if (file.type !== 'video/mp4' || !file.size || file.size > maximumProductVideoBytes) return 'Use an MP4 video up to 20 MB.';
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  type Box = { kind: string; body: number; end: number };
  let count = 0;
  function boxes(start: number, end: number): Box[] {
    const result: Box[] = [];
    for (let at = start; at < end;) {
      if (++count > 10000 || end - at < 8) throw new Error('Invalid box');
      let size = view.getUint32(at), header = 8;
      const kind = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
      if (size === 1) {
        if (end - at < 16) throw new Error('Invalid box');
        const large = view.getBigUint64(at + 8);
        if (large > BigInt(end - at)) throw new Error('Invalid box');
        size = Number(large); header = 16;
      } else if (size === 0) size = end - at;
      if (size < header || size > end - at) throw new Error('Invalid box');
      result.push({ kind, body: at + header, end: at + size }); at += size;
    }
    return result;
  }
  function duration(box: Box): number {
    const version = bytes[box.body];
    if ((version !== 0 && version !== 1) || box.end - box.body < (version === 1 ? 32 : 20)) throw new Error('Invalid duration');
    const scale = view.getUint32(box.body + (version === 1 ? 20 : 12));
    const ticks = version === 1 ? Number(view.getBigUint64(box.body + 24)) : view.getUint32(box.body + 16);
    if (!scale || !Number.isSafeInteger(ticks) || ticks <= 0) throw new Error('Invalid duration');
    return ticks / scale;
  }
  try {
    const top = boxes(0, bytes.length), movies = top.filter(b => b.kind === 'moov');
    if (movies.length !== 1 || !top.some(b => b.kind === 'ftyp' && b.end - b.body >= 8) || !top.some(b => b.kind === 'mdat' && b.end > b.body)) throw new Error('Incomplete movie');
    const movie = boxes(movies[0].body, movies[0].end), headers = movie.filter(b => b.kind === 'mvhd');
    if (headers.length !== 1) throw new Error('Invalid movie duration');
    const durations = [duration(headers[0])]; let videoTracks = 0;
    for (const track of movie.filter(b => b.kind === 'trak')) {
      const media = boxes(track.body, track.end).filter(b => b.kind === 'mdia');
      if (media.length !== 1) throw new Error('Invalid media track');
      const parts = boxes(media[0].body, media[0].end), handler = parts.find(b => b.kind === 'hdlr');
      if (!handler || handler.end - handler.body < 12) throw new Error('Invalid track handler');
      if (String.fromCharCode(...bytes.subarray(handler.body + 8, handler.body + 12)) !== 'vide') continue;
      const metadata = parts.filter(b => b.kind === 'mdhd');
      if (metadata.length !== 1) throw new Error('Missing video duration');
      videoTracks++; durations.push(duration(metadata[0]));
    }
    if (!videoTracks) throw new Error('No video track');
    return durations.some(value => value > maximumProductVideoSeconds) ? 'Product video must be 60 seconds or shorter.' : null;
  } catch { return 'The MP4 container or video-track metadata is invalid or incomplete.'; }
}
