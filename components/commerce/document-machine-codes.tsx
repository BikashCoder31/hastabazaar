import Image from 'next/image';

import {
  buildCode39Barcode,
  renderQrSvg,
  svgDataUri,
} from '@/lib/documents/machine-codes';
import { mediaObjectClass, mediaSizes } from '@/lib/media/responsive-media';

export async function DocumentMachineCodes({
  invoiceNumber,
  qrPayload,
}: {
  invoiceNumber: string;
  qrPayload: string;
}) {
  const barcode = buildCode39Barcode(invoiceNumber);
  const qrSource = svgDataUri(await renderQrSvg(qrPayload));
  return (
    <div className="mt-8 grid gap-6 border-t pt-6 sm:grid-cols-2 print:grid-cols-2">
      <figure className="min-w-0 rounded-xl border p-4 text-center print:border-slate-300">
        <svg
          viewBox={`0 0 ${barcode.width} 84`}
          className="mx-auto h-auto w-full max-w-sm"
          aria-hidden="true"
          shapeRendering="crispEdges"
        >
          <rect width={barcode.width} height="84" fill="white" />
          {barcode.bars.map((bar) => (
            <rect
              key={`${bar.x}-${bar.width}`}
              x={bar.x}
              y="4"
              width={bar.width}
              height="58"
              fill="#0f172a"
            />
          ))}
          <text
            x={barcode.width / 2}
            y="78"
            textAnchor="middle"
            fontFamily="monospace"
            fontSize="10"
            fill="#0f172a"
          >
            {barcode.value}
          </text>
        </svg>
        <figcaption className="mt-2 text-xs text-slate-600">
          Code 39 invoice reference
        </figcaption>
      </figure>
      <figure className="rounded-xl border p-4 text-center print:border-slate-300">
        {/* Generated locally from the immutable stored payload; no remote image or tracking request. */}
        <Image
          unoptimized
          src={qrSource}
          alt={`QR code for invoice ${invoiceNumber}`}
          width={192}
          height={192}
          data-media-mode="contain"
          sizes={mediaSizes.qr}
          className={mediaObjectClass(
            'contain',
            'media-shrink mx-auto size-48',
          )}
        />
        <figcaption className="mt-2 text-xs text-slate-600">
          Invoice verification reference
        </figcaption>
      </figure>
    </div>
  );
}
