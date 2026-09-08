// REV-271: paywall localization. A designed paywall carries ONE tree plus a
// side table of translated strings — never one tree per language — so styles,
// layout and block ids are shared and only words differ.
//
// Selection happens HERE, at render, rather than server-side at resolve. The
// resolution is cached on the device, so a locale chosen by the server would
// pin a cached paywall to whatever language it was fetched in: change the
// phone's language and the old copy would keep rendering until the cache
// expired, and offline it would never change at all.
//
// Mirrored across all six Revnix SDKs — keep the key scheme, the fallback
// chain and the field list identical.

import type { PaywallBlock, PaywallBlockDoc } from './blocks';

/** BCP-47, hyphenated: "es_MX" and "es-mx" both normalize to "es-MX". Applied
 *  to authored tags and to the device's reported locale alike, so the two can
 *  never miss each other over punctuation or case. */
export function normalizeLocale(tag: string | undefined): string | undefined {
  if (typeof tag !== 'string') return undefined;
  const parts = tag.trim().replace(/_/g, '-').split('-').filter(Boolean);
  const language = parts[0]?.toLowerCase();
  if (language === undefined || !/^[a-z]{2,3}$/.test(language)) return undefined;
  const rest: string[] = [];
  for (const part of parts.slice(1)) {
    // Region subtags are uppercase ("MX", "419"), scripts title case ("Hans").
    // Anything else is a variant and stays lowercase. A subtag outside
    // BCP-47's shapes makes the WHOLE tag junk rather than passing through —
    // otherwise a device reporting "es-!!" would look up a language.
    if (/^[A-Za-z]{2}$/.test(part) || /^\d{3}$/.test(part)) rest.push(part.toUpperCase());
    else if (/^[A-Za-z]{4}$/.test(part)) {
      rest.push(part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());
    } else if (/^[A-Za-z0-9]{5,8}$/.test(part)) rest.push(part.toLowerCase());
    else return undefined;
  }
  return [language, ...rest].join('-');
}

function baseLanguage(tag: string): string {
  return tag.split('-')[0] ?? tag;
}

/** Which tables to consult, most specific first.
 *
 *  "es-MX" on a paywall translated into "es" reads the "es" table: a regional
 *  variant that was never authored falls back to its language rather than to
 *  the source, which is the difference between a Mexican customer reading
 *  Spanish and reading English. The authored tree is the last resort and is
 *  deliberately NOT in this chain — the lookup falls through to it. */
export function localeChain(
  available: readonly string[],
  locale: string | undefined,
  defaultLocale: string | undefined,
): string[] {
  const chain: string[] = [];
  const push = (tag: string | undefined) => {
    if (tag !== undefined && available.includes(tag) && !chain.includes(tag)) {
      chain.push(tag);
    }
  };
  const wanted = normalizeLocale(locale);
  if (wanted !== undefined) {
    push(wanted);
    push(baseLanguage(wanted));
    // "es" asked for, only "es-MX" authored: one regional table beats the
    // source language, and the first sorted match keeps the choice
    // deterministic across devices rather than key-order dependent.
    if (chain.length === 0) {
      const language = baseLanguage(wanted);
      push(available.filter((tag) => baseLanguage(tag) === language).sort()[0]);
    }
  }
  push(normalizeLocale(defaultLocale));
  return chain;
}

/** The device's language. In a Capacitor WebView `navigator.language` follows
 *  the OS setting, so a paywall matching it matches the rest of the app. */
export function detectLocale(): string | undefined {
  const nav = (globalThis as { navigator?: { language?: string } }).navigator;
  if (typeof nav?.language === 'string' && nav.language.length > 0) return nav.language;
  try {
    return new Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return undefined;
  }
}

function localizeBlock(
  block: PaywallBlock,
  lookup: (key: string, authored: string) => string,
): PaywallBlock {
  const at = (path: string, authored: string) => lookup(`${block.id}.${path}`, authored);
  const opt = (path: string, authored: string | undefined) =>
    authored === undefined ? undefined : at(path, authored);
  switch (block.type) {
    case 'text':
      return { ...block, text: at('text', block.text) };
    case 'button':
      return { ...block, label: at('label', block.label) };
    case 'list':
      return {
        ...block,
        items: block.items.map((item, i) => ({
          ...item,
          title: at(`items.${i}.title`, item.title),
          description: opt(`items.${i}.description`, item.description),
        })),
      };
    case 'products':
      return {
        ...block,
        titleTpl: opt('titleTpl', block.titleTpl),
        priceTpl: opt('priceTpl', block.priceTpl),
        highlightSub: opt('highlightSub', block.highlightSub),
        badgeText: opt('badgeText', block.badgeText),
      };
    case 'card':
      return { ...block, children: block.children.map((c) => localizeBlock(c, lookup)) };
    default:
      return block;
  }
}

/** Returns the document with every string swapped for `locale`'s.
 *
 *  Applied ONCE before rendering rather than at each text node: the renderer
 *  then needs no localization awareness at all, and the six SDKs cannot drift
 *  on which fields are translatable. Returns the input untouched when nothing
 *  applies, so an untranslated paywall allocates nothing.
 *
 *  `{price}` and the other copy tags survive, because they are resolved AFTER
 *  this on the localized string — "Solo {price} al mes" works. */
export function localizeBlockDoc(
  doc: PaywallBlockDoc,
  locale: string | undefined,
): PaywallBlockDoc {
  const tables = doc.locales;
  if (tables === undefined) return doc;
  const available = Object.keys(tables);
  if (available.length === 0) return doc;
  const chain = localeChain(available, locale, doc.defaultLocale);
  if (chain.length === 0) return doc;
  const lookup = (key: string, authored: string): string => {
    for (const tag of chain) {
      const value = tables[tag]?.[key];
      // An empty translation means "not translated", never "render nothing":
      // a blank CTA is a dead paywall, and export/import round-trips leave
      // empty cells behind for every untouched row.
      if (typeof value === 'string' && value !== '') return value;
    }
    return authored;
  };
  return { ...doc, blocks: doc.blocks.map((b) => localizeBlock(b, lookup)) };
}
