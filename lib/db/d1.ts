export interface HathkritiBindings {
  DB: D1Database;
  MEDIA: R2Bucket;
}

export function requireDatabase(
  bindings: Partial<HathkritiBindings>,
): D1Database {
  if (!bindings.DB) {
    throw new Error('The DB binding is not available.');
  }

  return bindings.DB;
}

export function requireMediaBucket(
  bindings: Partial<HathkritiBindings>,
): R2Bucket {
  if (!bindings.MEDIA) {
    throw new Error('The MEDIA binding is not available.');
  }

  return bindings.MEDIA;
}
