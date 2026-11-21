import assert from 'node:assert/strict';
import test from 'node:test';
import { mediaSizes } from '../lib/media/responsive-media';
import { build } from 'esbuild';
import path from 'node:path';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FeaturedProduct } from '../lib/catalog/featured-products';
import ts from 'typescript';

function arithmetic(expression: ts.Expression): number {
  if (ts.isNumericLiteral(expression)) return Number(expression.text);
  if (ts.isParenthesizedExpression(expression))
    return arithmetic(expression.expression);
  if (ts.isBinaryExpression(expression)) {
    const left = arithmetic(expression.left),
      right = arithmetic(expression.right);
    switch (expression.operatorToken.kind) {
      case ts.SyntaxKind.PlusToken:
        return left + right;
      case ts.SyntaxKind.MinusToken:
        return left - right;
      case ts.SyntaxKind.AsteriskToken:
        return left * right;
      case ts.SyntaxKind.SlashToken:
        return left / right;
    }
  }
  throw new Error('Unsupported size arithmetic');
}

// Resolve this contract's px/vw/calc size lengths at independently specified
// viewport widths. Expected widths below come from the actual grids' column,
// gap, shell-padding and maximum-width rules, not from mediaSizes.
function slot(sizes: string, width: number): number {
  let depth = 0;
  const entries = [''];
  for (const char of sizes) {
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (char === ',' && depth === 0) entries.push('');
    else entries[entries.length - 1] += char;
  }
  function evaluate(value: string): number {
    const length = value
      .replace(/([\d.]+)vw/g, (_, number) => String((Number(number) * width) / 100))
      .replace(/px/g, '');
    assert.match(length, /^[\d.\s()+*/-]+$/);
    const parsed = ts.createSourceFile('size.ts', length, ts.ScriptTarget.Latest).statements[0];
    assert.ok(ts.isExpressionStatement(parsed));
    return arithmetic(parsed.expression);
  }
  for (const entry of entries) {
    const clause = /^\s*(?:\(min-width:\s*([\d.]+)px\)\s*)?(.+)$/.exec(entry)!;
    if (clause[1] && width < Number(clause[1])) continue;
    const clamped = clause[2].replace(/clamp\(([^()]*)\)/g, (_, argumentsText: string) => {
      const values = argumentsText.split(',').map((part) => evaluate(part));
      assert.equal(values.length, 3);
      return String(Math.max(values[0], Math.min(values[1], values[2])));
    });
    return evaluate(clamped.replace(/^calc\((.*)\)$/, '$1'));
  }
  throw new Error('No sizes fallback');
}

void test('responsive image hints follow real grid breakpoints and stop at shell bounds', () => {
  const cases: readonly [keyof typeof mediaSizes, number, number][] = [
    ['productGrid', 320, 288],
    ['productGrid', 768, 340],
    ['productGrid', 1024, 214],
    ['productGrid', 1440, 318],
    ['productGrid', 1920, 318],
    ['shopGrid', 320, 136],
    ['shopGrid', 768, 326],
    ['shopGrid', 1024, 217],
    ['shopGrid', 1440, 301],
    ['shopGrid', 1920, 301],
    ['makerGrid', 768, 340],
    ['makerGrid', 1024, 293.3333],
    ['makerGrid', 1280, 278],
    ['makerGrid', 1920, 318],
    ['savedProduct', 768, 342],
    ['savedProduct', 1024, 314],
    ['savedProduct', 1920, 341.3333],
    ['productGallery', 320, 288],
    ['productGallery', 768, 342.3256],
    ['productGallery', 1024, 479.2558],
    ['productGallery', 1280, 599.0698],
    ['productGallery', 1920, 642],
    ['galleryThumbnail', 320, 51.2],
    ['galleryThumbnail', 768, 64],
    ['galleryThumbnail', 1024, 64],
    ['galleryThumbnail', 1920, 84],
    ['productSlider', 320, 224.64],
    ['productSlider', 768, 295.68],
    ['productSlider', 1024, 214],
    ['productSlider', 1920, 318],
    ['editorial', 320, 288],
    ['editorial', 1024, 479.0016],
    ['editorial', 1920, 691.2],
    ['notFound', 320, 288],
    ['notFound', 1024, 483.84],
    ['notFound', 1920, 716.8],
  ];
  for (const [purpose, width, expected] of cases)
    assert.ok(
      Math.abs(slot(mediaSizes[purpose], width) - expected) < 0.01,
      `${purpose} at ${width}: expected ${expected}, got ${slot(mediaSizes[purpose], width)}`,
    );
});

void test('regular and wide product sliders advertise their distinct rendered slots', async () => {
  const compiled = await build({
    entryPoints: ['components/catalog/product-slider.tsx'],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    external: ['react', 'react/*', 'react-dom', 'react-dom/*', 'next/router'],
    alias: {
      'next/image': path.resolve('node_modules/vinext/dist/shims/image.js'),
      'next/link': path.resolve('node_modules/vinext/dist/shims/link.js'),
    },
  });
  const renderedModule = {
    exports: {} as {
      ProductSlider: ComponentType<{
        products: FeaturedProduct[];
        label: string;
        wideDesktop: boolean;
      }>;
    },
  };
  runInNewContext(compiled.outputFiles[0].text, {
    require: createRequire(import.meta.url),
    module: renderedModule,
    exports: renderedModule.exports,
    process,
    URL,
    console,
  });
  const product = {
    id: 'test',
    slug: 'craft',
    name: 'Craft',
    category: 'Crafts',
    price: '100',
    image: '/test.png',
    imageAlt: 'Craft',
  } as FeaturedProduct;
  for (const [wideDesktop, width, expected] of [
    [false, 1920, 318],
    [true, 1920, 297.6],
    [true, 1024, 214],
    [true, 320, 224.64],
  ] as const) {
    const html = renderToStaticMarkup(
      createElement(renderedModule.exports.ProductSlider, {
        products: [product],
        label: 'Crafts',
        wideDesktop,
      }),
    );
    const sizes = html.match(/<img\b[^>]*\bsizes="([^"]+)"/)?.[1];
    assert.ok(sizes);
    assert.ok(
      Math.abs(slot(sizes, width) - expected) < 0.01,
      `${wideDesktop ? 'wide' : 'regular'} at ${width}: expected ${expected}, got ${slot(sizes, width)}`,
    );
  }
});
