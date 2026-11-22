import { ArrowUpRight, MessageCircle, Phone } from 'lucide-react';
import { companyPublicContacts } from '@/lib/content/company-details';

export function SupportContactCard() {
  return (
    <section
      aria-labelledby="whatsapp-contact-heading"
      className="rounded-2xl border border-emerald-900/15 bg-emerald-50/60 p-5 sm:p-6"
    >
      <div className="mb-4 inline-flex size-11 items-center justify-center rounded-xl border border-emerald-900/10 bg-white text-emerald-800">
        <MessageCircle className="size-5" aria-hidden="true" />
      </div>
      <h2 id="whatsapp-contact-heading" className="font-heading text-2xl">
        A real person, a message away
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
        From choosing a gift to getting started as a seller, our team is here to
        help. Start a conversation on WhatsApp.
      </p>
      <div className="mt-4 flex flex-col items-start gap-2">
        <a
          href={companyPublicContacts.whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-900"
        >
          <MessageCircle className="size-4" aria-hidden="true" /> Chat on
          WhatsApp <ArrowUpRight className="size-4" aria-hidden="true" />
        </a>
        <a
          href={`tel:${companyPublicContacts.supportPhoneE164}`}
          className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-emerald-900 underline underline-offset-4"
        >
          <Phone className="size-4" aria-hidden="true" />
          <span>{companyPublicContacts.supportPhone}</span>
        </a>
      </div>
      <p className="mt-3 text-xs leading-6 text-muted-foreground">
        WhatsApp opens a separate conversation. Please don’t share passwords,
        payment PINs or verification codes.
      </p>
    </section>
  );
}
