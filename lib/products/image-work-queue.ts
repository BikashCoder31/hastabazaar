export class ImageWorkQueueFullError extends Error {
  constructor() {
    super('Product image processing is busy. Try again shortly.');
  }
}

// Waiting delivery jobs retain only their request metadata, not decoded images.
// Reserve a released slot for the next waiter before accepting new work.
export function createImageWorkQueue(
  concurrency: number,
  maximumWaiting: number,
) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async function run<T>(work: () => Promise<T>): Promise<T> {
    if (active < concurrency) active++;
    else {
      if (waiting.length >= maximumWaiting) throw new ImageWorkQueueFullError();
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    try {
      return await work();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}
