'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

export function ProductIntakePhotoPreview({ id, alt, className, file, caseId }: {
  id: string;
  alt: string;
  className: string;
  file?: File;
  caseId?: string;
}) {
  const [local, setLocal] = useState<{ file: File; url: string } | null>(null);
  const [savedOnly, setSavedOnly] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    let released = false;
    queueMicrotask(() => {
      if (!released) setLocal({ file, url });
    });
    return () => {
      released = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const localUrl = !savedOnly && local?.file === file ? local?.url : undefined;
  const savedUrl = '/api/seller/product-intakes/media/' + encodeURIComponent(id)
    + (caseId ? '?caseId=' + encodeURIComponent(caseId) : '');

  if (failed) {
    return <div className={'flex flex-col items-center justify-center gap-1 bg-[#F7F3EC] px-2 text-center text-xs ' + className}>
      <p>Photo preview unavailable.</p>
      <button type="button" className="min-h-11 underline" onClick={() => {
        setFailed(false);
        setAttempt(current => current + 1);
      }}>Retry preview</button>
    </div>;
  }

  if (file && !savedOnly && !localUrl) return <div aria-hidden="true" className={className} />;

  return <Image
    key={attempt}
    data-media-mode="contain"
    unoptimized
    width={640}
    height={480}
    src={localUrl ?? savedUrl}
    alt={alt}
    className={'object-contain ' + className}
    onError={() => {
      if (localUrl) setSavedOnly(true);
      else setFailed(true);
    }}
  />;
}
