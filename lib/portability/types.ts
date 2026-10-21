import type { PortableRow } from './values';

export type PortableTableClass =
  | 'durable'
  | 'security'
  | 'installation'
  | 'transient'
  | 'dispatch';
export type PortableColumn = {
  name: string;
  declaredType: string;
  nullable: boolean;
  /** Observed computed values remain in row hashes; destination adapters must
   * match their own trusted schema and omit these columns from INSERT. */
  generated?: 'virtual' | 'stored';
};
export type PortableTable = {
  name: string;
  columns: PortableColumn[];
  primaryKey: string[];
  classification: PortableTableClass;
  rowCount: number;
};
export type PortableNamespace = {
  id: string;
  access: 'public' | 'private';
  objectCount: number;
  totalBytes: number;
};

export type PortableInventory = {
  version: 1;
  installationId: string;
  databaseEngine: string;
  /** Host-independent schema identifier; uploaded SQL is never executed. */
  schemaFingerprint: string;
  application: {
    release: string;
    schemaVersion: string;
    requiredEnvironmentNames: string[];
    artifactSha256: string | null;
  };
  snapshot: {
    cutoff: string;
    revision: string;
    writeMode: 'paused' | 'preliminary';
  };
  /** Discovery is independent of classification. Missing or extra entries fail export. */
  discoveredTables: string[];
  /** Provider-owned internals are discovered and authenticated, never read or copied. */
  providerManagedTables?: {
    name: '_cf_METADATA';
    reason: 'provider-internal';
  }[];
  discoveredNamespaces: string[];
  tables: PortableTable[];
  namespaces: PortableNamespace[];
  security: { keyIds: string[]; payloadVersions: number[] };
};

export type PortableObjectMetadata = {
  namespace: string;
  key: string;
  size: number;
  contentType: string;
  customMetadata: Record<string, string>;
  httpMetadata: Record<string, string>;
};
export type PortableObject = PortableObjectMetadata & {
  bytes: AsyncIterable<Uint8Array>;
};

/** The adapter must hold a consistent snapshot or detect any intervening change. */
export interface PortableSourceSnapshot {
  inventory: PortableInventory;
  rows(table: PortableTable): AsyncIterable<PortableRow>;
  objects(namespace: PortableNamespace): AsyncIterable<PortableObject>;
  verifyUnchanged(): Promise<boolean>;
  close(): Promise<void>;
}
export interface PortableTransferSource {
  openSnapshot(): Promise<PortableSourceSnapshot>;
}

export type PortableTableManifest = {
  name: string;
  rows: number;
  sha256: string;
};
export type PortableNamespaceManifest = {
  id: string;
  objects: number;
  bytes: number;
  sha256: string;
};
export type PortableManifest = {
  packageId: string;
  tableRecords: PortableTableManifest[];
  media: PortableNamespaceManifest[];
  contentSha256: string;
  frameCount: number;
};
export type PortableRestoreManifest = {
  tableRecords: PortableTableManifest[];
  media: PortableNamespaceManifest[];
  omittedTables: string[];
};
export type PortableInspection = {
  format: 'hastabazaar-portable';
  version: 1;
  packageId: string;
  inventory: PortableInventory;
  manifest: PortableManifest;
  totalRows: number;
  totalObjects: number;
  totalObjectBytes: number;
  finalCutoverReady: boolean;
  warnings: string[];
};

/**
 * Implementations use a new isolated, already prepared schema. They must never
 * construct SQL from package input, invoke triggers with external effects, merge
 * existing business data, create schema, or enable dispatch during restoration.
 */
export interface PortableRestoreTarget {
  preflight(inventory: PortableInventory): Promise<{
    empty: boolean;
    schemaFingerprint: string;
    applicationCompatible: boolean;
    availableKeyIds: string[];
    dispatchPaused: boolean;
  }>;
  begin(inventory: PortableInventory): Promise<PortableRestoreTransaction>;
}
export interface PortableRestoreTransaction {
  writeRows(table: PortableTable, rows: PortableRow[]): Promise<void>;
  beginObject(metadata: PortableObjectMetadata): Promise<void>;
  writeObjectChunk(bytes: Uint8Array): Promise<void>;
  endObject(sha256: string): Promise<void>;
  /** Verify exact values/relationships/media and absence of active grants before commit. */
  verify(
    inspection: PortableInspection,
    expected: PortableRestoreManifest,
  ): Promise<boolean>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export type PortableInput = Uint8Array | AsyncIterable<Uint8Array>;
export type PortableKeyring = {
  version: 1;
  activeKeyId: string;
  keys: { id: string; keyBase64: string }[];
};
