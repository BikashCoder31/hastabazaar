import type { ReturnEvidenceInput } from '@/lib/db/repositories/returns';

async function sha256(bytes: ArrayBuffer | Uint8Array<ArrayBuffer>) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function deletePrivateReturnEvidence(bucket: R2Bucket, evidence: readonly ReturnEvidenceInput[]) {
  await Promise.allSettled(evidence.map(file => bucket.delete(file.objectKey)));
}

/** Receives bounded, content-verified files. Only the caller's atomic case write publishes the references. */
export async function uploadPrivateReturnEvidence(bucket: R2Bucket, namespace: string, files: readonly File[]) {
  const uploaded: ReturnEvidenceInput[] = [];
  try {
    for (const file of files) {
      const id = crypto.randomUUID();
      const objectKey = `private/return-evidence/${namespace}/${id}`;
      const fileDigest = await sha256(await file.arrayBuffer());
      const nameDigest = await sha256(new TextEncoder().encode(file.name));
      uploaded.push({ id, objectKey, originalName: file.name.slice(0,180), mimeType: file.type, sizeBytes: file.size,
        sha256: fileDigest, nameSha256: nameDigest });
      await bucket.put(objectKey, file.stream(), {
        httpMetadata: { contentType: file.type },
        customMetadata: { evidenceId: id, kind: 'return_evidence' },
      });
    }
    return uploaded;
  } catch (error) {
    await deletePrivateReturnEvidence(bucket, uploaded);
    throw error;
  }
}
