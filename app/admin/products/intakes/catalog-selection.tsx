'use client';

import { useRouter } from 'next/navigation';
import type { ComponentProps } from 'react';
import { ProductIntakeReview } from '@/components/admin/product-intake-review';
import { ProductPublicationReview } from '@/components/admin/product-publication-review';

export function HelpSelection(
  props: Omit<ComponentProps<typeof ProductIntakeReview>, 'onRecorded'>,
) {
  const router = useRouter();
  return <ProductIntakeReview {...props} onRecorded={() => router.refresh()} />;
}

export function PublishingSelection(
  props: Omit<ComponentProps<typeof ProductPublicationReview>, 'onRecorded'>,
) {
  const router = useRouter();
  return (
    <ProductPublicationReview
      {...props}
      onRecorded={async () => router.refresh()}
    />
  );
}
