import Link from 'next/link';
import { SiteHeader } from './site-header';
import { SiteFooter } from './site-footer';
import {
  publicPages,
  publicPageNavigation,
  type PublicPageKey,
  type PublicPage,
} from '@/lib/content/public-pages';

export function PublicInformationPage({ pageKey }: { pageKey: PublicPageKey }) {
  const page: PublicPage = publicPages[pageKey];
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main id="main-content">
        <div className="border-b bg-secondary/30">
          <div className="shell py-10 sm:py-14">
            <p className="eyebrow">HastaBazaar · Information & support</p>
            <h1 className="mt-3 font-heading text-4xl tracking-tight sm:text-5xl">
              {page.title}
            </h1>
            <p className="mt-4 max-w-3xl text-lg leading-8 text-muted-foreground">
              {page.intro}
            </p>
          </div>
        </div>
        <div className="shell grid gap-8 py-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-12 lg:py-12">
          <aside className="min-w-0 lg:sticky lg:top-40 lg:self-start">
            <nav
              aria-label="Information pages"
              className="flex flex-wrap gap-2 lg:flex-col"
            >
              {publicPageNavigation.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={
                    item.href === `/${pageKey}` ? 'page' : undefined
                  }
                  className={`rounded-xl px-4 py-3 text-sm font-semibold ${item.href === `/${pageKey}` ? 'bg-primary text-primary-foreground' : 'border hover:bg-secondary'}`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <nav
              aria-label="On this page"
              className="mt-6 rounded-2xl border p-4"
            >
              <details>
                <summary className="cursor-pointer py-1 text-sm font-semibold">
                  On this page
                </summary>
                <ul className="mt-2 space-y-1">
                  {page.sections.map((section) => (
                    <li key={section.id}>
                      <a
                        href={`#${section.id}`}
                        className="inline-block py-2 text-sm leading-5 text-primary underline-offset-4 hover:underline"
                      >
                        {section.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            </nav>
          </aside>
          <article className="min-w-0 max-w-3xl">
            <p className="text-sm text-muted-foreground">
              Last updated: 11 September 2026
            </p>
            <div className="mt-6 space-y-8">
              {page.sections.map((section) => (
                <section
                  id={section.id}
                  key={section.id}
                  className="scroll-mt-44 border-b pb-8 last:border-0"
                >
                  <h2 className="font-heading text-2xl sm:text-3xl">
                    {section.title}
                  </h2>
                  {section.paragraphs.map((paragraph, index) => (
                    <p
                      key={index}
                      className="mt-4 break-words text-base leading-8 text-muted-foreground"
                    >
                      {paragraph}
                    </p>
                  ))}
                  {section.links ? (
                    <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                      {section.links.map((link) => (
                        <Link
                          key={link.href}
                          href={link.href}
                          className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
                        >
                          {link.label} →
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </section>
              ))}
            </div>
          </article>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
