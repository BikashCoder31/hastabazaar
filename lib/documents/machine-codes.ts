import QRCode from 'qrcode';

const code39Patterns: Readonly<Record<string, string>> = Object.freeze({
  '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn',
  '4': 'nnnwwnnnw', '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw',
  '8': 'wnnwnnwnn', '9': 'nnwwnnwnn', A: 'wnnnnwnnw', B: 'nnwnnwnnw',
  C: 'wnwnnwnnn', D: 'nnnnwwnnw', E: 'wnnnwwnnn', F: 'nnwnwwnnn',
  G: 'nnnnnwwnw', H: 'wnnnnwwnn', I: 'nnwnnwwnn', J: 'nnnnwwwnn',
  K: 'wnnnnnnww', L: 'nnwnnnnww', M: 'wnwnnnnwn', N: 'nnnnwnnww',
  O: 'wnnnwnnwn', P: 'nnwnwnnwn', Q: 'nnnnnnwww', R: 'wnnnnnwwn',
  S: 'nnwnnnwwn', T: 'nnnnwnwwn', U: 'wwnnnnnnw', V: 'nwwnnnnnw',
  W: 'wwwnnnnnn', X: 'nwnnwnnnw', Y: 'wwnnwnnnn', Z: 'nwwnwnnnn',
  '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn', '$': 'nwnwnwnnn',
  '/': 'nwnwnnnwn', '+': 'nwnnnwnwn', '%': 'nnnwnwnwn', '*': 'nwnnwnwnn',
});

export type BarcodeBar = Readonly<{ x: number; width: number }>;

export function buildCode39Barcode(input: string): Readonly<{
  value: string;
  width: number;
  bars: readonly BarcodeBar[];
}> {
  const value = input.trim().toUpperCase();
  if (!value || value.length > 80 || Array.from(value).some((character) => !code39Patterns[character] || character === '*')) {
    throw new RangeError('Barcode value contains unsupported Code 39 characters.');
  }
  const encoded = `*${value}*`;
  const bars: BarcodeBar[] = [];
  const narrow = 2;
  const wide = 6;
  const quiet = 20;
  let x = quiet;
  for (const character of encoded) {
    const pattern = code39Patterns[character]!;
    for (let index = 0; index < pattern.length; index += 1) {
      const width = pattern[index] === 'w' ? wide : narrow;
      if (index % 2 === 0) bars.push(Object.freeze({ x, width }));
      x += width;
    }
    x += narrow;
  }
  return Object.freeze({ value, width: x + quiet - narrow, bars: Object.freeze(bars) });
}

export async function renderQrSvg(payload: string): Promise<string> {
  if (!payload || payload.length > 512 || Array.from(payload).some((character) => character.charCodeAt(0) < 32)) {
    throw new RangeError('QR payload is invalid.');
  }
  return QRCode.toString(payload, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 192,
    color: { dark: '#0f172a', light: '#ffffff' },
  });
}

export function svgDataUri(svg: string): string {
  if (!svg.startsWith('<svg') || /<script|on\w+=|(?:href|xlink:href)=/i.test(svg)) {
    throw new RangeError('Generated SVG was not accepted.');
  }
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
