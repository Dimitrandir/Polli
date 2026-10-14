// A small Markdown renderer for the salon's articles and pages. It covers what that content uses
// (headings, paragraphs, lists, quotes, rules, bold, italic, links) and builds React elements,
// so no raw HTML from the content ever reaches the page.

import Link from "next/link";
import type { ReactNode } from "react";

const OLD_SITE_HOSTS = new Set(["sisesthetics.com", "www.sisesthetics.com"]);

const OLD_SITE_PAGES: Record<string, string> = {
  "/": "/",
  "/booking/": "/rezervacia",
  "/contacts/": "/kontakti",
  "/about-us/": "/za-nas",
  "/services/": "/uslugi",
};

const NEW_SITE_PATH = /^\/(statii|uslugi|rezervacia|kontakti|za-nas|obshti-usloviya|poveritelnost)(\/[^/\s]*)?$/;

/** Where a link should point on the new site. Links to the old site go to the matching new page. */
export function localHref(href: string): string | null {
  // A path on the new site, e.g. an article link in the assistant's reply.
  if (NEW_SITE_PATH.test(href)) return href;
  let url: URL;
  try {
    url = new URL(href, "https://sisesthetics.com");
  } catch {
    return null;
  }
  if (!["http:", "https:", "mailto:", "tel:"].includes(url.protocol)) return null;
  if (!OLD_SITE_HOSTS.has(url.hostname)) return url.href;
  const path = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  if (OLD_SITE_PAGES[path]) return OLD_SITE_PAGES[path];
  const slug = decodeURIComponent(path.replace(/^\/|\/$/g, ""));
  return slug.includes("/") ? url.href : `/statii/${encodeURIComponent(slug)}`;
}

const INLINE =
  /\*\*(.+?)\*\*|\*([^*\s](?:[^*]*?[^*\s])?)\*|\[([^\]]+)\]\(([^)\s]+)\)|<((?:https?:\/\/|mailto:)[^>\s]+)>/g;

export function renderInline(text: string, keyPrefix = "i"): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(text.slice(last, index));
    const key = `${keyPrefix}-${n++}`;
    const [, bold, italic, label, target, auto] = match;
    if (bold !== undefined) {
      nodes.push(<strong key={key}>{renderInline(bold, key)}</strong>);
    } else if (italic !== undefined) {
      nodes.push(<em key={key}>{renderInline(italic, key)}</em>);
    } else {
      const href = localHref(auto ?? target);
      const children = auto ?? renderInline(label, key);
      if (!href) nodes.push(<span key={key}>{children}</span>);
      else if (href.startsWith("/"))
        nodes.push(
          <Link key={key} href={href}>
            {children}
          </Link>,
        );
      else
        nodes.push(
          <a key={key} href={href} target="_blank" rel="noopener noreferrer">
            {children}
          </a>,
        );
    }
    last = index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const RULE = /^(\*\s*\*\s*\*|-\s*-\s*-|_\s*_\s*_)[*\-_\s]*$/;
const QUOTE = /^>\s?/;
const BULLET = /^[*-]\s+/;
const NUMBERED = /^(\d+)\.\s+/;

function startsBlock(line: string): boolean {
  return HEADING.test(line) || RULE.test(line) || QUOTE.test(line) || BULLET.test(line) || NUMBERED.test(line);
}

function withBreaks(lines: string[], key: string): ReactNode[] {
  return lines.flatMap((line, i) => [
    ...(i ? [<br key={`${key}-br${i}`} />] : []),
    ...renderInline(line.trim(), `${key}-${i}`),
  ]);
}

/** Render Markdown as React elements. The page title is the h1, so "#" and "##" both become h2. */
export function renderMarkdown(source: string): ReactNode[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const key = `b${blocks.length}`;
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = line.match(HEADING);
    if (heading) {
      const level = Math.min(Math.max(heading[1].length, 2), 4);
      const Tag = `h${level}` as "h2" | "h3" | "h4";
      blocks.push(<Tag key={key}>{renderInline(heading[2].trim(), key)}</Tag>);
      i++;
    } else if (RULE.test(line)) {
      blocks.push(<hr key={key} />);
      i++;
    } else if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) quoted.push(lines[i++].replace(QUOTE, ""));
      blocks.push(<blockquote key={key}>{renderMarkdown(quoted.join("\n"))}</blockquote>);
    } else if (BULLET.test(line) || NUMBERED.test(line)) {
      const ordered = NUMBERED.test(line);
      const marker = ordered ? NUMBERED : BULLET;
      const items: string[] = [];
      while (i < lines.length && marker.test(lines[i])) items.push(lines[i++].replace(marker, ""));
      const children = items.map((item, n) => <li key={`${key}-${n}`}>{renderInline(item.trim(), `${key}-${n}`)}</li>);
      blocks.push(
        ordered ? (
          <ol key={key} start={Number(line.match(NUMBERED)?.[1] ?? 1)}>
            {children}
          </ol>
        ) : (
          <ul key={key}>{children}</ul>
        ),
      );
    } else {
      const paragraph: string[] = [];
      while (i < lines.length && lines[i].trim() && !startsBlock(lines[i])) paragraph.push(lines[i++]);
      blocks.push(<p key={key}>{withBreaks(paragraph, key)}</p>);
    }
  }
  return blocks;
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  return <div className={className ?? "prose-salon"}>{renderMarkdown(source)}</div>;
}
