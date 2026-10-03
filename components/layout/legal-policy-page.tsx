import Link from 'next/link';
import type { ReactNode } from 'react';
import { FileText } from 'lucide-react';

import {
  getLegalPolicyDocument,
  publicLegalPolicies,
  type PublicLegalPolicyKey,
} from '@/lib/content/legal-policies';
import { LegalPolicyNavigation } from './legal-policy-navigation';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

type Block =
  | { type: 'heading'; level: 2 | 3; id: string; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'table'; rows: string[][] }
  | { type: 'rule' };

function plainText(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

function slug(value: string): string {
  return (
    plainText(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'section'
  );
}

function isTableDivider(line: string): boolean {
  return /^\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(line);
}

function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function startsBlock(line: string, next?: string): boolean {
  return (
    /^#{1,3}\s+/.test(line) ||
    /^---+$/.test(line) ||
    /^>\s?/.test(line) ||
    /^[-*]\s+/.test(line) ||
    /^\d+\.\s+/.test(line) ||
    (line.trim().startsWith('|') && Boolean(next && isTableDivider(next)))
  );
}

function parseDocument(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  const seen = new Map<string, number>();
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      index += 1;
      if (heading[1].length === 1) continue;
      const base = slug(heading[2]);
      const count = (seen.get(base) ?? 0) + 1;
      seen.set(base, count);
      blocks.push({
        type: 'heading',
        level: heading[1].length as 2 | 3,
        id: count === 1 ? base : `${base}-${count}`,
        text: heading[2],
      });
      continue;
    }

    if (/^---+$/.test(line)) {
      blocks.push({ type: 'rule' });
      index += 1;
      continue;
    }

    if (line.startsWith('>')) {
      const parts: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith('>')) {
        parts.push(lines[index].trim().replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push({ type: 'quote', text: parts.join(' ') });
      continue;
    }

    if (
      line.startsWith('|') &&
      index + 1 < lines.length &&
      isTableDivider(lines[index + 1].trim())
    ) {
      const rows = [tableCells(line)];
      index += 2;
      while (index < lines.length && lines[index].trim().startsWith('|')) {
        rows.push(tableCells(lines[index]));
        index += 1;
      }
      blocks.push({ type: 'table', rows });
      continue;
    }

    const ordered = /^\d+\.\s+/.test(line);
    const unordered = /^[-*]\s+/.test(line);
    if (ordered || unordered) {
      const items: string[] = [];
      const pattern = ordered ? /^\d+\.\s+/ : /^[-*]\s+/;
      while (index < lines.length && pattern.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(pattern, ''));
        index += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !startsBlock(lines[index].trim(), lines[index + 1]?.trim())
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
  }

  return blocks;
}

function safeHref(href: string): string | null {
  return /^(?:https:\/\/|mailto:|\/|#)/.test(href) ? href : null;
}

function inline(value: string): ReactNode[] {
  const token =
    /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|Return, Exchange, Cancellation & Refund Policy|Prohibited & Restricted Products Policy|Seller Marketplace Agreement|Shipping & Delivery Policy|Terms & Conditions|Privacy Policy|Cookie Policy|support@hastabazaar\.com)/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const match of value.matchAll(token)) {
    const position = match.index ?? 0;
    if (position > cursor) nodes.push(value.slice(cursor, position));
    const part = match[0];
    if (part.startsWith('**')) {
      nodes.push(
        <strong key={`${position}-strong`}>{part.slice(2, -2)}</strong>,
      );
    } else if (part.startsWith('`')) {
      nodes.push(
        <code
          key={`${position}-code`}
          className="rounded bg-secondary px-1 py-0.5 text-[0.92em]"
        >
          {part.slice(1, -1)}
        </code>,
      );
    } else if (part.startsWith('[')) {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
      const href = link ? safeHref(link[2]) : null;
      if (!link || !href) nodes.push(part);
      else if (href.startsWith('/')) {
        nodes.push(
          <Link
            key={`${position}-link`}
            href={href}
            className="font-semibold text-primary underline underline-offset-4"
          >
            {link[1]}
          </Link>,
        );
      } else {
        nodes.push(
          <a
            key={`${position}-link`}
            href={href}
            className="font-semibold text-primary underline underline-offset-4"
          >
            {link[1]}
          </a>,
        );
      }
    } else {
      const destinations: Record<string, string> = {
        'Terms & Conditions': '/terms',
        'Return, Exchange, Cancellation & Refund Policy': '/returns',
        'Shipping & Delivery Policy': '/shipping',
        'Privacy Policy': '/privacy',
        'Cookie Policy': '/cookies',
        'Prohibited & Restricted Products Policy': '/prohibited-products',
        'Seller Marketplace Agreement': '/seller-agreement',
        'support@hastabazaar.com': 'mailto:support@hastabazaar.com',
      };
      const href = destinations[part];
      nodes.push(
        href.startsWith('/') ? (
          <Link
            key={`${position}-policy-link`}
            href={href}
            className="font-semibold text-primary underline underline-offset-4"
          >
            {part}
          </Link>
        ) : (
          <a
            key={`${position}-email-link`}
            href={href}
            className="font-semibold text-primary underline underline-offset-4"
          >
            {part}
          </a>
        ),
      );
    }
    cursor = position + part.length;
  }
  if (cursor < value.length) nodes.push(value.slice(cursor));
  return nodes;
}

export function LegalDocumentContent({ markdown }: { markdown: string }) {
  const blocks = parseDocument(markdown);
  return (
    <div className="space-y-5">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const Tag = block.level === 2 ? 'h2' : 'h3';
          return (
            <Tag
              id={block.id}
              key={`${block.id}-${index}`}
              className={
                block.level === 2
                  ? 'scroll-mt-36 border-t pt-9 font-heading text-2xl sm:text-3xl'
                  : 'scroll-mt-36 pt-3 text-xl font-bold'
              }
            >
              {inline(block.text)}
            </Tag>
          );
        }
        if (block.type === 'paragraph') {
          return (
            <p key={index} className="leading-8 text-muted-foreground">
              {inline(block.text)}
            </p>
          );
        }
        if (block.type === 'quote') {
          return (
            <blockquote
              key={index}
              className="rounded-2xl border border-amber-300/60 bg-amber-50 p-5 leading-7 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100"
            >
              {inline(block.text)}
            </blockquote>
          );
        }
        if (block.type === 'list') {
          const Tag = block.ordered ? 'ol' : 'ul';
          return (
            <Tag
              key={index}
              className={`space-y-2 pl-6 leading-7 text-muted-foreground ${block.ordered ? 'list-decimal' : 'list-disc'}`}
            >
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{inline(item)}</li>
              ))}
            </Tag>
          );
        }
        if (block.type === 'table') {
          const [head, ...body] = block.rows;
          return (
            <div key={index} className="overflow-x-auto rounded-2xl border">
              <table className="w-full min-w-[42rem] border-collapse text-left text-sm">
                <thead className="bg-secondary">
                  <tr>
                    {head.map((cell, cellIndex) => (
                      <th
                        key={cellIndex}
                        className="border-b px-4 py-3 font-semibold"
                      >
                        {inline(cell)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {body.map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-b last:border-0">
                      {row.map((cell, cellIndex) => (
                        <td
                          key={cellIndex}
                          className="px-4 py-3 align-top leading-6 text-muted-foreground"
                        >
                          {inline(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return <hr key={index} className="my-8 border-border" />;
      })}
    </div>
  );
}

export function LegalPolicyPage({
  policyKey,
}: {
  policyKey: PublicLegalPolicyKey;
}) {
  const policy = publicLegalPolicies[policyKey];
  const markdown = getLegalPolicyDocument(policyKey);
  const headings = parseDocument(markdown).filter(
    (block): block is Extract<Block, { type: 'heading' }> =>
      block.type === 'heading' && block.level === 2,
  );

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main id="main-content">
        <div className="border-b bg-secondary/30">
          <div className="shell py-6 sm:py-14">
            <p className="eyebrow">HastaBazaar · Legal & Policies</p>
            <h1 className="mt-2 max-w-4xl font-heading text-3xl leading-tight tracking-tight sm:mt-3 sm:text-5xl">
              {policy.title}
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground sm:mt-4 sm:text-lg sm:leading-8">
              {policy.description}
            </p>
          </div>
        </div>
        <div className="shell grid gap-5 py-5 sm:gap-8 sm:py-8 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-12 lg:py-12 print:block">
          <aside className="min-w-0 lg:sticky lg:top-32 lg:max-h-[calc(100vh-9rem)] lg:self-start lg:overflow-y-auto print:hidden">
            <LegalPolicyNavigation
              policyKey={policyKey}
              headings={headings.map((heading) => ({
                id: heading.id,
                text: plainText(heading.text),
              }))}
            />
          </aside>
          <article className="min-w-0 max-w-4xl rounded-3xl border bg-card p-5 shadow-sm sm:p-8 lg:p-10">
            <div className="mb-8 flex items-center gap-2 border-b pb-5 text-sm text-muted-foreground">
              <FileText className="size-4" aria-hidden="true" />
              Policy document
            </div>
            <LegalDocumentContent markdown={markdown} />
          </article>
        </div>
      </main>
      <SiteFooter compact />
    </div>
  );
}
