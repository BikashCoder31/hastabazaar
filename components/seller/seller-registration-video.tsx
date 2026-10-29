'use client';

import { useRef } from 'react';
import { ChevronDown, CirclePlay } from 'lucide-react';

export function SellerRegistrationVideo() {
  const video = useRef<HTMLVideoElement>(null);

  return (
    <details
      className="group overflow-hidden rounded-2xl border border-primary/20 bg-secondary/35"
      onToggle={(event) => {
        if (!event.currentTarget.open) video.current?.pause();
      }}
    >
      <summary className="flex cursor-pointer list-none items-center gap-4 rounded-2xl p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:p-5 [&::-webkit-details-marker]:hidden">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <CirclePlay className="size-6" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span lang="ne" className="block font-semibold text-foreground">विक्रेता दर्ता कसरी गर्ने? भिडियो हेर्नुहोस्</span>
          <span className="mt-1 block text-sm text-muted-foreground">Seller registration guide in Nepali · 4 minutes</span>
        </span>
        <ChevronDown className="size-5 shrink-0 text-primary transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="space-y-3 border-t border-primary/10 p-4 sm:p-5">
        <p lang="ne" className="rounded-lg border bg-background p-3 text-sm leading-6">दर्ता प्रक्रिया अद्यावधिक गरिएको छ: अहिले उपलब्ध विवरण मात्र भरेर आवेदन पठाउन सक्नुहुन्छ। बाँकी विवरण पछि ड्यासबोर्डबाट थप्नुहोस्। फोनमा OTP आवश्यक छैन। बैंक विवरण, सार्वजनिक निर्माता प्रोफाइल र उत्पादनसम्बन्धी विवरण पनि ड्यासबोर्डमा थप्नुहोस्। भिडियोका यी पुराना चरणहरू छोड्नुहोस्। बिक्री सुरु गर्न सुपर एडमिनको स्वीकृति आवश्यक हुन्छ।</p>
        <p lang="ne" className="text-sm leading-6 text-muted-foreground">
          खाता बनाउने, आवश्यक कागजात बुझ्ने र आवेदन पठाउने तरिका हेर्नुहोस्।
        </p>
        <video
          ref={video}
          controls
          playsInline
          preload="none"
          poster="/guides/seller-registration-nepali.webp"
          aria-label="विक्रेता दर्ताको नेपाली भिडियो"
          className="aspect-video w-full rounded-xl bg-black"
        >
          <source src="/guides/seller-registration-nepali.mp4" type="video/mp4" />
          <track kind="captions" src="/guides/seller-registration-nepali.vtt" srcLang="ne" label="नेपाली" />
          Your browser cannot play this video. You can download it using the link below.
        </video>
        <a href="/guides/seller-registration-nepali.mp4" download className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4">
          <span lang="ne">भिडियो डाउनलोड गर्नुहोस्</span>
        </a>
      </div>
    </details>
  );
}
