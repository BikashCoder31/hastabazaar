import {captureDatabaseHealthScope,type DatabaseHealthBindings} from './health-context';
export interface HastaBazaarBindings {
  DB: D1Database;
  MEDIA: R2Bucket;
}

export function requireDatabase(
  bindings: Partial<HastaBazaarBindings>&DatabaseHealthBindings,
): D1Database {
  if (!bindings.DB) {
    throw new Error('The DB binding is not available.');
  }

  captureDatabaseHealthScope(bindings.DB,bindings);
  return bindings.DB;
}

export function requireMediaBucket(
  bindings: Partial<HastaBazaarBindings>,
): R2Bucket {
  if (!bindings.MEDIA) {
    throw new Error('The MEDIA binding is not available.');
  }

  return bindings.MEDIA;
}
