import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

void test('public hero and editor share copy, layout, media frame, and caption contracts', async () => {
  const [copy, carousel, preview] = await Promise.all([
    readFile(
      new URL('components/homepage/homepage-hero-copy.tsx', root),
      'utf8',
    ),
    readFile(
      new URL('components/homepage/homepage-hero-carousel.tsx', root),
      'utf8',
    ),
    readFile(
      new URL('components/admin/homepage-hero-preview.tsx', root),
      'utf8',
    ),
  ]);

  for (const source of [carousel, preview]) {
    assert.match(source, /<HomepageHeroCopy slide=\{slide\}/);
    assert.match(source, /className=\{heroLayoutClass\}/);
    assert.match(
      source,
      /mediaFrameClass\(\s*'cover',\s*'homepage-hero-frame'/,
    );
    assert.match(source, /className=\{heroNoteClass\}/);
  }
  // Geometry and visible wrapping are checked in scripts/responsive-layout-check.mjs.
  assert.match(copy, /\{slide\.body\}/);
  assert.match(copy, /href=\{slide\.primaryActionHref\}/);
  assert.match(copy, /href=\{slide\.secondaryActionHref\}/);
});

void test('shared page sections, long copy, and actions reflow on narrow screens', async () => {
  const styles = await readFile(new URL('app/globals.css', root), 'utf8');
  const shell = styles.match(/\.shell\s*\{([^}]*)\}/)?.[1] ?? '';
  const sectionLink = styles.match(/\.section-link\s*\{([^}]*)\}/)?.[1] ?? '';

  assert.match(shell, /px-\[clamp\(0\.75rem,5vw,2rem\)\]/);
  assert.match(styles, /\.section-heading\s*\{[^}]*clamp\(/);
  assert.match(styles, /\.section-title\s*\{[^}]*clamp\(/);
  assert.match(sectionLink, /min-w-0/);
  assert.match(sectionLink, /max-w-full/);
  assert.match(sectionLink, /whitespace-normal/);
  assert.doesNotMatch(sectionLink, /shrink-0/);
  assert.match(
    styles,
    /:where\(h1,\s*h2,\s*h3,\s*h4,\s*p,\s*li,\s*dt,\s*dd,\s*th,\s*td\)[^{]*\{[^}]*overflow-wrap:\s*anywhere/,
  );
});

void test('customer, seller, and staff navigation wrap labels instead of truncating them', async () => {
  const [sidebar, account, seller, admin] = await Promise.all([
    readFile(new URL('components/ui/sidebar.tsx', root), 'utf8'),
    readFile(
      new URL('components/account/account-navigation.tsx', root),
      'utf8',
    ),
    readFile(new URL('components/seller/seller-navigation.tsx', root), 'utf8'),
    readFile(new URL('components/admin/admin-navigation.tsx', root), 'utf8'),
  ]);
  const buttonVariants =
    sidebar.match(
      /const sidebarMenuButtonVariants = cva\(([\s\S]*?)\n\);/,
    )?.[1] ?? '';

  assert.doesNotMatch(buttonVariants, /\[&>span:last-child\]:truncate/);
  assert.match(buttonVariants, /\[&>span:last-child\]:whitespace-normal/);
  assert.match(buttonVariants, /\[&>span:last-child\]:break-words/);
  assert.match(
    account,
    /grid-cols-1 gap-1 min-\[360px\]:grid-cols-2 sm:grid-cols-4/,
  );
  assert.match(seller, /<nav aria-label="Seller quick links" className="seller-mobile-tabs">/);
  assert.match(seller, /aria-label="Open seller menu" aria-haspopup="dialog"/);
  assert.match(seller, /<nav aria-label="All seller pages"[^>]*>\s*<ul className="grid\b[^"]*\bgap-1\b[^"]*\bsm:grid-cols-2\b[^"]*">/);
  assert.match(seller, /<span className="whitespace-normal">\{section\.label\}<\/span>/);
  assert.doesNotMatch(seller, /className="[^"]*\b(?:truncate|whitespace-nowrap)\b[^"]*"/);
  // The searchable staff menu now collapses on mobile; labels must still wrap.
  assert.match(admin, /className="min-w-0 whitespace-normal"/);
  assert.doesNotMatch(admin, /className="[^"]*\btruncate\b[^"]*"/);
});

// Complete header geometry and search interaction are exercised against the
// rendered app by scripts/header-single-row-check.mjs, not CSS text assertions.

void test('Super Admin homepage product titles wrap inside narrow preview cards', async () => {
  const adminHome = await readFile(
    new URL('app/admin/homepage/page.tsx', root),
    'utf8',
  );

  assert.match(
    adminHome,
    /className="block min-w-0 break-words font-semibold hover:underline"/,
  );
  assert.doesNotMatch(
    adminHome,
    /className="truncate font-semibold hover:underline"/,
  );
});
