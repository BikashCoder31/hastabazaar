import { Buffer } from 'node:buffer';

const stagingOrigin = 'https://staging.hastabazaar.com';
const maxPosterBytes = 256 * 1024;
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const posters = [
  { name: 'Fonepay', fileName: 'fonepay.png' },
  { name: 'Nabil NEPALPAY', fileName: 'nepalpay.png' },
] as const;

export type StagingTransferQr = {
  name: string;
  src: string;
  width: number;
  height: number;
};

type TransferQrPayment = {
  state: string;
  now: number;
  cutoffAt: number;
  remainingPaisa: number;
  instruction: { accountVersionId: string; requiresAccountReview: boolean };
};

export async function readStagingBankTransferQrs(
  origin: string | undefined,
  bucket: Pick<R2Bucket, 'get'> | undefined,
  order: TransferQrPayment,
): Promise<StagingTransferQr[]> {
  const { accountVersionId, requiresAccountReview } = order.instruction;
  const waiting = order.state === 'awaiting_payment' || order.state === 'partially_paid';
  if (origin !== stagingOrigin || !bucket || !waiting || order.now >= order.cutoffAt ||
      order.remainingPaisa <= 0 || requiresAccountReview || !/^[a-zA-Z0-9_-]{1,160}$/.test(accountVersionId)) {
    return [];
  }

  try {
    const codes = await Promise.all(posters.map(async ({ name, fileName }) => {
      const image = await bucket.get(`private/company-bank-qr/${accountVersionId}/${fileName}`);
      if (!image) return null;
      if (image.size < 24 || image.size > maxPosterBytes ||
          image.httpMetadata?.contentType !== 'image/png') {
        await image.body.cancel();
        return null;
      }
      const bytes = Buffer.from(await new Response(image.body).arrayBuffer());
      if (bytes.length !== image.size || !bytes.subarray(0, pngSignature.length).equals(pngSignature)) return null;
      const width = bytes.readUInt32BE(16);
      const height = bytes.readUInt32BE(20);
      if (width < 1 || width > 2048 || height < 1 || height > 2048) return null;
      return { name, src: 'data:image/png;base64,' + bytes.toString('base64'), width, height };
    }));
    return codes.every(code => code !== null) ? codes : [];
  } catch {
    return [];
  }
}
