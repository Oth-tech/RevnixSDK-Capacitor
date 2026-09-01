// Block paywalls — the designed-paywall renderer.
//
// A paywall built in the dashboard's block builder publishes a TREE of styled
// elements on `config.blocks`, and that tree takes precedence over the classic
// `template` layouts in ui.ts. This file is the Capacitor interpreter of that
// document: a framework-free DOM port of revnix-app's
// src/components/paywall-blocks/BlockScreen.tsx, which is the reference
// renderer. Keep the two in lockstep — they are two interpreters of the SAME
// document, and a field only one side knows is a design that ships looking
// different from the design that was approved.
//
// Two rules matter more here than in the dashboard, because a shipped app
// cannot be patched from our side:
//
//   * An unknown block type, layout or style field is SKIPPED and the rest of
//     the screen still renders. A paywall published by a newer dashboard than
//     the app's SDK must degrade, never crash and never blank.
//   * A tag with no data behind it stays visible (`{price}` renders as
//     `{price}`) rather than resolving to something wrong. A customer must
//     never be shown a price the store will not charge.

/** Per-block visual style. Everything optional — a block renders sensibly
 *  with no style at all. Sizes are px numbers; colors are any CSS color, or a
 *  palette token (`@accent`, `@text`, `@bg`, `@accentInk`, optionally with an
 *  alpha percentage: `@text/12`). */
export interface BlockStyle {
  fill?: string;
  fillSize?: string;
  textColor?: string;
  /** 0–100, like the dashboard's opacity inputs. */
  opacity?: number;
  borderColor?: string;
  borderWidth?: number;
  /** Per-side rules, as a CSS border shorthand ("1px solid @text/12"). */
  borderTop?: string;
  borderRight?: string;
  borderBottom?: string;
  borderLeft?: string;
  radius?: number;
  padding?: number;
  paddingX?: number;
  paddingY?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  margin?: number;
  marginTop?: number | 'auto';
  marginRight?: number | 'auto';
  marginBottom?: number | 'auto';
  marginLeft?: number | 'auto';
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: string;
  fontStyle?: 'normal' | 'italic';
  align?: 'left' | 'center' | 'right';
  /** In em, like CSS. */
  letterSpacing?: number;
  /** Unitless multiplier, like CSS. */
  lineHeight?: number;
  textTransform?: 'none' | 'uppercase';
  decoration?: 'none' | 'underline' | 'line-through';
  textWrap?: 'balance' | 'pretty';
  nowrap?: boolean;
  gap?: number;
  height?: number | string;
  minHeight?: number;
  width?: number | string;
  maxWidth?: number | string;
  aspectRatio?: number | string;
  flex?: number;
  shrink?: number;
  basis?: number;
  wrap?: boolean;
  justify?: 'start' | 'center' | 'end' | 'between';
  items?: 'start' | 'center' | 'end' | 'baseline' | 'stretch';
  selfAlign?: 'start' | 'center' | 'end' | 'baseline' | 'stretch';
  shadow?: string;
  blur?: number;
  filter?: string;
  clipPath?: string;
  rotate?: number;
  translate?: string;
  /** Placement inside a `stack` container. */
  inset?: boolean;
  top?: number | string;
  right?: number | string;
  bottom?: number | string;
  left?: number | string;
  zIndex?: number;
  overflow?: 'hidden' | 'visible';
}

export interface TextBlock {
  id: string;
  type: 'text';
  text: string;
  style?: BlockStyle;
}

export interface ImageBlock {
  id: string;
  type: 'image';
  url?: string;
  shape?: 'rect' | 'circle';
  fit?: 'cover' | 'contain';
  placeholder?: string;
  style?: BlockStyle;
}

export interface ListBlock {
  id: string;
  type: 'list';
  items: Array<{ icon?: string; title: string; description?: string }>;
  iconColor?: string;
  style?: BlockStyle;
}

export interface ProductsBlock {
  id: string;
  type: 'products';
  direction?: 'column' | 'row';
  titleTpl?: string;
  priceTpl?: string;
  highlightSub?: string;
  badgeText?: string;
  cardStyle?: BlockStyle;
  highlightStyle?: BlockStyle;
  style?: BlockStyle;
}

export interface ButtonBlock {
  id: string;
  type: 'button';
  label: string;
  style?: BlockStyle;
}

export interface LinksBlock {
  id: string;
  type: 'links';
  showRestore?: boolean;
  showTerms?: boolean;
  showPrivacy?: boolean;
  termsUrl?: string;
  privacyUrl?: string;
  style?: BlockStyle;
}

export interface LineBlock {
  id: string;
  type: 'line';
  style?: BlockStyle;
}

export interface SpacerBlock {
  id: string;
  type: 'spacer';
  flex?: boolean;
  style?: BlockStyle;
}

/** The one container block. `layout` picks how children are placed: column /
 *  row are flex lines, `stack` layers them (children position with
 *  style.inset or the edge offsets), and `grid` is an N-column grid. */
export interface CardBlock {
  id: string;
  type: 'card';
  layout?: 'column' | 'row' | 'stack' | 'grid';
  repeat?: 'packages';
  selectedStyle?: BlockStyle;
  packageIndex?: number;
  columns?: number;
  gridColumns?: string;
  children: PaywallBlock[];
  style?: BlockStyle;
}

export type PaywallBlock =
  | TextBlock
  | ImageBlock
  | ListBlock
  | ProductsBlock
  | ButtonBlock
  | LinksBlock
  | LineBlock
  | SpacerBlock
  | CardBlock;

export interface PaywallBlockDoc {
  version: number;
  /** "canvas" designs are authored against a fixed device screen and scale as
   *  a whole; "flow" designs lay out in a scrolling column. */
  layout?: 'canvas' | 'flow';
  background: unknown;
  textColor: string;
  accent: string;
  accentInk: string;
  fontFamily?: string;
  blocks: PaywallBlock[];
}

/** The device screen `canvas` designs are authored against. */
export const DESIGN_CANVAS = { width: 393, height: 852 };

/** One purchasable row, as the block renderer needs it. The money fields are
 *  optional: without them the price tags stay visible rather than resolving
 *  to a number the store would not charge. */
export interface BlockPackage {
  packageId: string;
  title: string;
  priceLabel: string;
  /** Renewal cycle from the product ("annual", "monthly", …). */
  period?: string;
  amountMinor?: number;
  currency?: string;
}

// ——— document validation ———

/**
 * Narrows an untyped `config.blocks` to a renderable document.
 *
 * The config crosses a network boundary from a dashboard that may be newer
 * than this SDK, so the shape is checked rather than trusted: anything that is
 * not a block document at all returns null and the caller falls back to the
 * classic layouts. Individual blocks INSIDE the tree are not pre-validated —
 * they are skipped at render time, so one malformed block costs its own
 * subtree and not the screen.
 */
export function asBlockDoc(value: unknown): PaywallBlockDoc | null {
  if (typeof value !== 'object' || value === null) return null;
  const doc = value as Partial<PaywallBlockDoc>;
  if (!Array.isArray(doc.blocks) || doc.blocks.length === 0) return null;
  if (typeof doc.textColor !== 'string' || typeof doc.accent !== 'string') return null;
  return doc as PaywallBlockDoc;
}

// ——— colors ———

const TOKEN = /@(accentInk|accent|bg|text)(?:\/(\d{1,3}))?/g;

interface Rgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function toRgb(color: string): Rgb | null {
  const value = color.trim();
  if (value.startsWith('#')) {
    const hex = value.slice(1);
    if (!/^[0-9a-fA-F]+$/.test(hex)) return null;
    const expand = (c: string) => parseInt(c + c, 16);
    if (hex.length === 3 || hex.length === 4) {
      return {
        r: expand(hex[0]),
        g: expand(hex[1]),
        b: expand(hex[2]),
        a: hex.length === 4 ? expand(hex[3]) / 255 : 1,
      };
    }
    if (hex.length === 6 || hex.length === 8) {
      const byte = (i: number) => parseInt(hex.slice(i, i + 2), 16);
      return {
        r: byte(0),
        g: byte(2),
        b: byte(4),
        a: hex.length === 8 ? byte(6) / 255 : 1,
      };
    }
    return null;
  }
  const fn = value.match(/^rgba?\(([^)]+)\)$/i);
  if (fn) {
    const parts = fn[1]
      .split(/[,/\s]+/)
      .filter(Boolean)
      .map(Number);
    if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  }
  return null;
}

/** Multiplies a color's alpha. Anything this cannot parse (a named color, a
 *  gradient) is returned as-is rather than guessed at. */
export function withAlpha(color: string, alpha: number): string {
  const rgb = toRgb(color);
  if (!rgb) return color;
  const a = Math.max(0, Math.min(1, rgb.a * alpha));
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Math.round(a * 1000) / 1000})`;
}

/** The screen background as a flat color — the base layer of a gradient, or
 *  the ground color of the layered background spec. */
export function backgroundBaseColor(background: unknown): string {
  if (typeof background === 'string') {
    const hex = background.match(/#[0-9a-fA-F]{3,8}\b/);
    if (hex) return hex[0];
    const fn = background.match(/rgba?\([^)]+\)/i);
    if (fn) return fn[0];
    return background;
  }
  if (typeof background === 'object' && background !== null) {
    const ground = (background as { ground?: unknown }).ground;
    if (typeof ground === 'string') return backgroundBaseColor(ground);
  }
  return '#000000';
}

/** Expands palette tokens in a color string and applies any `/pct` alpha. */
export function resolveColor(value: string | undefined, doc: PaywallBlockDoc): string | undefined {
  if (value === undefined) return undefined;
  if (!value.includes('@')) return value;
  return value.replace(TOKEN, (_match, name: string, pct?: string) => {
    const base =
      name === 'accentInk'
        ? doc.accentInk
        : name === 'accent'
          ? doc.accent
          : name === 'bg'
            ? backgroundBaseColor(doc.background)
            : doc.textColor;
    return pct === undefined ? base : withAlpha(base, Number(pct) / 100);
  });
}

/** The screen background as a CSS `background` value. A layered spec becomes
 *  its ground; the photo layer is the host app's own asset and is painted by
 *  the image URL when one is published. */
export function backgroundCss(background: unknown): string {
  if (typeof background === 'string') return background;
  if (typeof background === 'object' && background !== null) {
    const ground = (background as { ground?: unknown }).ground;
    if (typeof ground === 'string') return ground;
  }
  return '#000000';
}

// ——— tag variables ———

/** Renewal cycles, in months. Lifetime and one-time products have no cycle. */
const MONTHS: Record<string, number | undefined> = {
  weekly: 1 / 4.345,
  monthly: 1,
  two_months: 2,
  three_months: 3,
  six_months: 6,
  annual: 12,
  lifetime: undefined,
  non_subscription: undefined,
  consumable: undefined,
};

const PERIOD_WORD: Record<string, string> = {
  weekly: 'week',
  monthly: 'month',
  two_months: '2 months',
  three_months: '3 months',
  six_months: '6 months',
  annual: 'year',
  lifetime: 'lifetime',
};

const PERIOD_SHORT: Record<string, string> = {
  weekly: 'wk',
  monthly: 'mo',
  two_months: '2mo',
  three_months: '3mo',
  six_months: '6mo',
  annual: 'yr',
  lifetime: 'once',
};

/** Minor units per major unit. Not every currency is a hundredth: JPY and KRW
 *  have no minor unit at all, so dividing by 100 would understate a price by
 *  100×. Intl knows each currency's exponent — ask it rather than assume. */
export function minorUnitsForCurrency(currency: string): number {
  try {
    const digits = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    }).resolvedOptions().maximumFractionDigits;
    return 10 ** (digits ?? 2);
  } catch {
    return 100;
  }
}

function money(amountMinor: number, currency: string): string {
  const per = minorUnitsForCurrency(currency);
  const major = amountMinor / per;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      // A whole amount reads better without ".00"; a fractional one must keep
      // its digits.
      maximumFractionDigits: amountMinor % per === 0 ? 0 : undefined,
    }).format(major);
  } catch {
    return `${major.toFixed(per === 1 ? 0 : 2)} ${currency}`;
  }
}

function perMonthMinor(pkg: BlockPackage): number | undefined {
  const months = pkg.period ? MONTHS[pkg.period] : undefined;
  if (!months || pkg.amountMinor === undefined) return undefined;
  return pkg.amountMinor / months;
}

/**
 * Fills a copy template from one package. `all` is the rest of the offering,
 * which {save_percent} needs to have something to compare against.
 *
 * A tag this cannot answer from real package data is left in place, VISIBLE.
 * That is deliberate: a design that says `{price}` and renders `$0.00`, or a
 * stale sample price, is worse than one that visibly did not resolve.
 */
export function resolveTags(text: string, pkg: BlockPackage | undefined, all: BlockPackage[] = []): string {
  if (!pkg || !text.includes('{')) return text;
  return text.replace(/\{(\w+)\}/g, (raw, name: string) => {
    switch (name) {
      case 'title':
        return pkg.title;
      case 'price':
        return pkg.priceLabel;
      case 'period':
        return pkg.period ? (PERIOD_WORD[pkg.period] ?? raw) : raw;
      case 'period_short':
        return pkg.period ? (PERIOD_SHORT[pkg.period] ?? raw) : raw;
      case 'price_per_month': {
        const per = perMonthMinor(pkg);
        return per !== undefined && pkg.currency ? money(Math.round(per), pkg.currency) : raw;
      }
      case 'save_percent': {
        const mine = perMonthMinor(pkg);
        const dearest = Math.max(...all.map((p) => perMonthMinor(p) ?? 0), 0);
        if (!mine || !dearest || dearest <= mine) return raw;
        return `${Math.round((1 - mine / dearest) * 100)}%`;
      }
      default:
        // Unknown tag: leave it visible rather than guess.
        return raw;
    }
  });
}

/** A template that resolves to nothing useful falls back to the plain value —
 *  a products card must show a title and a price even if its template names a
 *  tag this SDK does not know. */
function withFallback(tpl: string, pkg: BlockPackage, all: BlockPackage[], fallback: string): string {
  const out = resolveTags(tpl, pkg, all);
  return out.trim() === '' ? fallback : out;
}

// ——— style ———

const JUSTIFY: Record<string, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
};

const ITEMS: Record<string, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  baseline: 'baseline',
  stretch: 'stretch',
};

const px = (v: number | string): string => (typeof v === 'number' ? `${v}px` : v);

/**
 * BlockStyle → inline CSS, applied onto an element's style object.
 *
 * Every field is independently optional and independently applied: a style
 * key this SDK does not know is simply never read, which is what lets a newer
 * dashboard's design render here minus that one effect instead of failing.
 */
export function applyBlockStyle(node: HTMLElement, s: BlockStyle | undefined, doc: PaywallBlockDoc): void {
  if (!s) return;
  const css = node.style;
  const color = (v: string | undefined) => resolveColor(v, doc);

  if (s.fill !== undefined) css.background = color(s.fill) ?? '';
  if (s.fillSize !== undefined) css.backgroundSize = s.fillSize;
  if (s.textColor !== undefined) css.color = color(s.textColor) ?? '';
  if (s.opacity !== undefined) css.opacity = String(s.opacity / 100);
  if (s.borderColor !== undefined || s.borderWidth !== undefined) {
    css.border = `${s.borderWidth ?? 1}px solid ${color(s.borderColor) ?? doc.textColor}`;
  }
  if (s.borderTop !== undefined) css.borderTop = color(s.borderTop) ?? '';
  if (s.borderRight !== undefined) css.borderRight = color(s.borderRight) ?? '';
  if (s.borderBottom !== undefined) css.borderBottom = color(s.borderBottom) ?? '';
  if (s.borderLeft !== undefined) css.borderLeft = color(s.borderLeft) ?? '';
  if (s.radius !== undefined) css.borderRadius = px(s.radius);
  if (s.padding !== undefined) css.padding = px(s.padding);
  if (s.paddingX !== undefined) {
    css.paddingLeft = px(s.paddingX);
    css.paddingRight = px(s.paddingX);
  }
  if (s.paddingY !== undefined) {
    css.paddingTop = px(s.paddingY);
    css.paddingBottom = px(s.paddingY);
  }
  // Per-side wins over the shorthands, so a converted design can pin one edge.
  if (s.paddingTop !== undefined) css.paddingTop = px(s.paddingTop);
  if (s.paddingRight !== undefined) css.paddingRight = px(s.paddingRight);
  if (s.paddingBottom !== undefined) css.paddingBottom = px(s.paddingBottom);
  if (s.paddingLeft !== undefined) css.paddingLeft = px(s.paddingLeft);
  if (s.margin !== undefined) css.margin = px(s.margin);
  if (s.marginTop !== undefined) css.marginTop = px(s.marginTop);
  if (s.marginRight !== undefined) css.marginRight = px(s.marginRight);
  if (s.marginBottom !== undefined) css.marginBottom = px(s.marginBottom);
  if (s.marginLeft !== undefined) css.marginLeft = px(s.marginLeft);
  if (s.fontSize !== undefined) css.fontSize = px(s.fontSize);
  if (s.fontWeight !== undefined) css.fontWeight = String(s.fontWeight);
  // The design's own face, when the host page has it. An unavailable family
  // falls through to the inherited stack rather than blanking the copy.
  if (s.fontFamily !== undefined) css.fontFamily = `"${s.fontFamily}", inherit`;
  if (s.fontStyle !== undefined) css.fontStyle = s.fontStyle;
  if (s.align !== undefined) css.textAlign = s.align;
  if (s.letterSpacing !== undefined) css.letterSpacing = `${s.letterSpacing}em`;
  if (s.lineHeight !== undefined) css.lineHeight = String(s.lineHeight);
  if (s.textTransform !== undefined) css.textTransform = s.textTransform;
  if (s.decoration !== undefined) css.textDecoration = s.decoration;
  if (s.textWrap !== undefined) css.setProperty('text-wrap', s.textWrap);
  if (s.nowrap) css.whiteSpace = 'nowrap';
  if (s.gap !== undefined) css.gap = px(s.gap);
  if (s.height !== undefined) css.height = px(s.height);
  if (s.minHeight !== undefined) css.minHeight = px(s.minHeight);
  if (s.width !== undefined) css.width = px(s.width);
  if (s.maxWidth !== undefined) css.maxWidth = px(s.maxWidth);
  if (s.aspectRatio !== undefined) css.aspectRatio = String(s.aspectRatio);
  if (s.flex !== undefined) css.flexGrow = String(s.flex);
  if (s.shrink !== undefined) css.flexShrink = String(s.shrink);
  // After `flex`, so an explicit basis always wins over its 0%.
  if (s.basis !== undefined) css.flexBasis = px(s.basis);
  if (s.wrap) css.flexWrap = 'wrap';
  if (s.justify !== undefined) css.justifyContent = JUSTIFY[s.justify] ?? '';
  if (s.items !== undefined) css.alignItems = ITEMS[s.items] ?? '';
  if (s.selfAlign !== undefined) css.alignSelf = ITEMS[s.selfAlign] ?? '';
  if (s.shadow !== undefined) css.boxShadow = color(s.shadow) ?? '';
  if (s.blur !== undefined) css.backdropFilter = `blur(${s.blur}px)`;
  if (s.filter !== undefined) css.filter = color(s.filter) ?? '';
  if (s.clipPath !== undefined) css.clipPath = s.clipPath;
  if (s.rotate !== undefined) css.transform = `rotate(${s.rotate}deg)`;
  if (s.translate !== undefined) css.translate = s.translate;
  if (s.zIndex !== undefined) css.zIndex = String(s.zIndex);
  if (s.overflow !== undefined) css.overflow = s.overflow;
  // Stack placement. `inset` fills the parent; individual offsets pin edges.
  // Both imply absolute positioning, which is inert outside a stack parent.
  if (s.inset) {
    css.position = 'absolute';
    css.inset = '0';
  } else if (s.top !== undefined || s.right !== undefined || s.bottom !== undefined || s.left !== undefined) {
    css.position = 'absolute';
    if (s.top !== undefined) css.top = px(s.top);
    if (s.right !== undefined) css.right = px(s.right);
    if (s.bottom !== undefined) css.bottom = px(s.bottom);
    if (s.left !== undefined) css.left = px(s.left);
  }
}

// ——— rendering ———

/** Everything the tree needs that is not in the document itself. */
export interface BlockRenderContext {
  doc: PaywallBlockDoc;
  packages: BlockPackage[];
  /** The package a plan card is visually emphasizing, and the one whose tags
   *  a subtree resolves against outside a `repeat`. */
  highlightPackageId?: string;
  /** Fills an image block that publishes no URL of its own. */
  heroImageUrl?: string;
  /** Paywall-level Terms/Privacy, used when a links block sets none. */
  footer?: { termsUrl?: string; privacyUrl?: string };
  onRestore?: () => void;
  onTerms?: () => void;
  onPrivacy?: () => void;
  /** Pressing the purchase button. */
  onPurchase?: () => void;
}

function div(doc: Document, tag = 'div'): HTMLElement {
  return doc.createElement(tag);
}

/** A plain container div, typed as one — the renderer's own root. */
function box(doc: Document): HTMLDivElement {
  return doc.createElement('div');
}

/**
 * Renders one block into a DOM node, or null when the block contributes
 * nothing.
 *
 * Returns null rather than throwing for anything it cannot render — an
 * unknown `type` from a newer dashboard, a malformed node, a plan card whose
 * package the offering does not reach. The caller drops the null and keeps
 * going, so the rest of the screen survives.
 */
export function renderBlock(
  block: PaywallBlock,
  ctx: BlockRenderContext,
  document: Document,
  pkg?: BlockPackage,
): HTMLElement | null {
  if (typeof block !== 'object' || block === null) return null;
  const { doc, packages } = ctx;

  switch (block.type) {
    case 'text': {
      const node = div(document);
      const s = block.style;
      // A text block that asks for cross/main-axis alignment (the ×-close
      // chip, centered badges) is a flex box in the source design; without
      // display:flex those properties are inert and the glyph sits top-left.
      if (s?.items !== undefined || s?.justify !== undefined) node.style.display = 'flex';
      applyBlockStyle(node, s, doc);
      node.textContent = resolveTags(String(block.text ?? ''), pkg, packages);
      return node;
    }

    case 'image': {
      const node = div(document);
      const url = block.url || ctx.heroImageUrl;
      const s = block.style;
      // The 160px/16px defaults suit a slot dropped into a flow column; a
      // converted design sizes its own slot, and the defaults must not fight it.
      const sized =
        s !== undefined &&
        (Boolean(s.inset) ||
          s.height !== undefined ||
          s.aspectRatio !== undefined ||
          (s.top !== undefined && s.bottom !== undefined) ||
          s.flex !== undefined);
      if (!sized) node.style.height = '160px';
      node.style.borderRadius = block.shape === 'circle' ? '50%' : sized ? '0' : '16px';
      node.style.overflow = 'hidden';
      node.style.flexShrink = '0';
      applyBlockStyle(node, s, doc);
      if (url) {
        const img = document.createElement('img');
        img.src = url;
        img.alt = '';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = block.fit ?? 'cover';
        img.style.display = 'block';
        node.appendChild(img);
      } else {
        const slot = div(document);
        slot.style.cssText =
          'width:100%;height:100%;display:flex;align-items:center;justify-content:center;' +
          'padding:8px;box-sizing:border-box;text-align:center;font-size:10.5px;line-height:1.35;' +
          'opacity:0.62;background:linear-gradient(135deg, rgba(125,135,155,0.3), rgba(125,135,155,0.12))';
        slot.textContent = block.placeholder ?? 'image';
        node.appendChild(slot);
      }
      return node;
    }

    case 'list': {
      const node = div(document);
      node.style.display = 'flex';
      node.style.flexDirection = 'column';
      node.style.gap = px(block.style?.gap ?? 8);
      node.style.textAlign = 'left';
      applyBlockStyle(node, block.style, doc);
      const items = Array.isArray(block.items) ? block.items : [];
      for (const item of items) {
        const row = div(document);
        row.style.display = 'flex';
        row.style.gap = '9px';
        const icon = div(document, 'span');
        icon.style.color = resolveColor(block.iconColor, doc) ?? doc.accent;
        icon.style.fontWeight = '800';
        icon.style.flexShrink = '0';
        icon.textContent = item?.icon ?? '✓';
        const body = div(document, 'span');
        body.style.minWidth = '0';
        const title = div(document, 'span');
        title.style.fontWeight = item?.description ? '700' : '500';
        title.textContent = String(item?.title ?? '');
        body.appendChild(title);
        if (item?.description) {
          const desc = div(document, 'span');
          desc.style.display = 'block';
          desc.style.fontSize = '12px';
          desc.style.opacity = '0.7';
          desc.textContent = item.description;
          body.appendChild(desc);
        }
        row.appendChild(icon);
        row.appendChild(body);
        node.appendChild(row);
      }
      return node;
    }

    case 'products':
      return renderProducts(block, ctx, document);

    case 'button': {
      const node = div(document, 'button');
      (node as HTMLButtonElement).type = 'button';
      // A converted CTA sizes itself with an explicit height and centers with
      // flex; the padded default is only for buttons added by hand.
      const sized = block.style?.height !== undefined;
      node.style.background = doc.accent;
      node.style.color = doc.accentInk;
      node.style.borderRadius = '12px';
      node.style.border = 'none';
      node.style.padding = sized ? '0 16px' : '15px 16px';
      node.style.display = 'flex';
      node.style.alignItems = 'center';
      node.style.justifyContent = 'center';
      node.style.fontWeight = '800';
      node.style.fontSize = '15px';
      node.style.textAlign = 'center';
      node.style.cursor = 'pointer';
      node.style.font = node.style.font || '';
      applyBlockStyle(node, block.style, doc);
      node.textContent = resolveTags(String(block.label ?? ''), pkg, packages);
      if (ctx.onPurchase) node.addEventListener('click', () => ctx.onPurchase?.());
      return node;
    }

    case 'links': {
      const entries: Array<{ label: string; url?: string; onPress?: () => void }> = [];
      if (block.showRestore ?? true) entries.push({ label: 'Restore', onPress: ctx.onRestore });
      if (block.showTerms ?? true)
        entries.push({ label: 'Terms', url: block.termsUrl ?? ctx.footer?.termsUrl, onPress: ctx.onTerms });
      if (block.showPrivacy ?? true)
        entries.push({ label: 'Privacy', url: block.privacyUrl ?? ctx.footer?.privacyUrl, onPress: ctx.onPrivacy });
      if (entries.length === 0) return null;
      const node = div(document);
      node.style.display = 'flex';
      node.style.justifyContent = 'center';
      node.style.gap = '20px';
      node.style.fontSize = '12px';
      node.style.opacity = '0.65';
      applyBlockStyle(node, block.style, doc);
      for (const entry of entries) {
        // An explicit host handler wins over the config URL — the app knows
        // best how to open its own legal pages; the URL is the fallback.
        if (entry.onPress) {
          const button = div(document, 'span');
          button.style.cursor = 'pointer';
          button.setAttribute('role', 'button');
          button.setAttribute('tabindex', '0');
          button.textContent = entry.label;
          button.addEventListener('click', () => entry.onPress?.());
          node.appendChild(button);
        } else if (entry.url) {
          const anchor = document.createElement('a');
          anchor.href = entry.url;
          anchor.target = '_blank';
          anchor.rel = 'noopener noreferrer';
          anchor.style.cursor = 'pointer';
          anchor.style.color = 'inherit';
          anchor.textContent = entry.label;
          node.appendChild(anchor);
        } else {
          const span = div(document, 'span');
          span.textContent = entry.label;
          node.appendChild(span);
        }
      }
      return node;
    }

    case 'line': {
      const node = div(document);
      node.style.height = '1px';
      node.style.background = 'currentColor';
      node.style.opacity = '0.16';
      applyBlockStyle(node, block.style, doc);
      return node;
    }

    case 'spacer': {
      const node = div(document);
      if (block.flex) {
        node.style.flex = '1';
      } else {
        node.style.height = '16px';
        applyBlockStyle(node, block.style, doc);
      }
      return node;
    }

    case 'card':
      return renderCard(block, ctx, document, pkg);

    default:
      // An unknown block type from a newer dashboard: skip this node, keep
      // the screen. Never crash, never blank.
      return null;
  }
}

function containerBase(block: CardBlock, node: HTMLElement): void {
  const layout = block.layout ?? 'column';
  // Every container is a positioning context, so a child pinned with
  // top/right offsets (a SAVE badge on a plan card) anchors to its own card
  // rather than the screen.
  node.style.position = 'relative';
  if (layout === 'stack') return;
  if (layout === 'grid') {
    node.style.display = 'grid';
    node.style.gridTemplateColumns = block.gridColumns ?? `repeat(${block.columns ?? 2}, minmax(0, 1fr))`;
    node.style.gap = px(block.style?.gap ?? 10);
    return;
  }
  // column / row — and any layout value this SDK does not know, which falls
  // back to a column rather than rendering nothing.
  node.style.display = 'flex';
  node.style.flexDirection = layout === 'row' ? 'row' : 'column';
  node.style.gap = px(block.style?.gap ?? 10);
}

function renderCard(
  block: CardBlock,
  ctx: BlockRenderContext,
  document: Document,
  pkg?: BlockPackage,
): HTMLElement | null {
  const { doc, packages } = ctx;
  const layout = block.layout ?? 'column';
  const children = Array.isArray(block.children) ? block.children : [];

  const selectedId =
    ctx.highlightPackageId && packages.some((p) => p.packageId === ctx.highlightPackageId)
      ? ctx.highlightPackageId
      : packages[0]?.packageId;

  const fill = (node: HTMLElement, ctxPkg: BlockPackage | undefined) => {
    for (const child of children) {
      const rendered = renderBlock(child, ctx, document, ctxPkg);
      if (rendered) node.appendChild(rendered);
    }
  };

  if (block.repeat === 'packages') {
    // One designed card, rendered per package. With nothing attached a single
    // instance still renders, so the design stays visible.
    const list: Array<BlockPackage | undefined> = packages.length ? packages : [undefined];
    const wrapper = div(document);
    wrapper.style.display = 'contents';
    for (const p of list) {
      const node = div(document);
      containerBase(block, node);
      if (layout !== 'stack') node.style.borderRadius = '16px';
      applyBlockStyle(node, block.style, doc);
      if (p && p.packageId === selectedId) applyBlockStyle(node, block.selectedStyle, doc);
      fill(node, p);
      wrapper.appendChild(node);
    }
    return wrapper;
  }

  // A card that names a package the offering does not reach is dropped rather
  // than shown with unresolved tags.
  if (block.packageIndex !== undefined && packages[block.packageIndex] === undefined) {
    return null;
  }

  const node = div(document);
  containerBase(block, node);
  if (layout !== 'stack') node.style.borderRadius = '16px';
  applyBlockStyle(node, block.style, doc);
  fill(node, block.packageIndex !== undefined ? (packages[block.packageIndex] ?? pkg) : pkg);
  return node;
}

function renderProducts(block: ProductsBlock, ctx: BlockRenderContext, document: Document): HTMLElement {
  const { doc, packages } = ctx;
  const shown = packages;
  const hlId =
    ctx.highlightPackageId && shown.some((p) => p.packageId === ctx.highlightPackageId)
      ? ctx.highlightPackageId
      : shown[0]?.packageId;
  const row = block.direction === 'row';

  const node = div(document);
  node.style.display = 'flex';
  node.style.flexDirection = row ? 'row' : 'column';
  node.style.gap = px(block.style?.gap ?? 8);
  applyBlockStyle(node, block.style, doc);

  for (const pkg of shown) {
    const hl = pkg.packageId === hlId;
    const card = div(document);
    card.style.position = 'relative';
    if (row) card.style.flex = '1';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap = '3px';
    card.style.borderRadius = '14px';
    card.style.padding = '12px 14px';
    card.style.border = `1.5px solid ${hl ? doc.accent : 'rgba(128,128,128,0.35)'}`;
    card.style.background = hl ? withAlpha(doc.accent, 0.12) : 'transparent';
    card.style.textAlign = row ? 'center' : 'left';
    applyBlockStyle(card, hl ? block.highlightStyle : block.cardStyle, doc);

    if (hl && block.badgeText) {
      const badge = div(document, 'span');
      badge.style.cssText =
        'position:absolute;top:-9px;right:12px;font-size:10px;font-weight:800;' +
        'letter-spacing:0.05em;padding:2px 8px;border-radius:99px';
      badge.style.background = doc.accent;
      badge.style.color = doc.accentInk;
      badge.textContent = block.badgeText;
      card.appendChild(badge);
    }

    const title = div(document, 'span');
    title.style.fontWeight = '700';
    title.style.fontSize = '14px';
    title.textContent = withFallback(block.titleTpl ?? '{title}', pkg, shown, pkg.title);
    card.appendChild(title);

    const price = div(document, 'span');
    price.style.fontSize = '13px';
    price.textContent = withFallback(block.priceTpl ?? '{price}', pkg, shown, pkg.priceLabel);
    card.appendChild(price);

    if (hl && block.highlightSub) {
      const sub = div(document, 'span');
      sub.style.fontSize = '11.5px';
      sub.style.opacity = '0.75';
      sub.textContent = block.highlightSub;
      card.appendChild(sub);
    }
    node.appendChild(card);
  }
  return node;
}

/**
 * Renders a whole block document into a screen element.
 *
 * `canvas` documents are authored against a fixed 393×852 device screen and
 * are scaled as a whole so absolute placement stays true at any width; `flow`
 * documents lay out as an ordinary column.
 */
export function renderBlockDoc(ctx: BlockRenderContext, document: Document): HTMLDivElement {
  const { doc } = ctx;
  const screen = box(document);
  screen.style.background = backgroundCss(doc.background);
  screen.style.color = doc.textColor;
  if (doc.fontFamily) screen.style.fontFamily = `"${doc.fontFamily}", inherit`;

  const body = box(document);
  for (const block of doc.blocks) {
    const rendered = renderBlock(block, ctx, document);
    if (rendered) body.appendChild(rendered);
  }

  if (doc.layout === 'canvas') {
    // Laid out at 1× and scaled, so absolute placement inside `stack`
    // containers stays true at any width. The converted designs were drawn
    // against the UA default line height; the host page's own could stretch
    // every label that does not declare one.
    screen.style.position = 'relative';
    screen.style.width = '100%';
    screen.style.overflow = 'hidden';
    body.style.position = 'absolute';
    body.style.top = '0';
    body.style.left = '0';
    body.style.width = `${DESIGN_CANVAS.width}px`;
    body.style.height = `${DESIGN_CANVAS.height}px`;
    body.style.transformOrigin = 'top left';
    body.style.lineHeight = 'normal';
    screen.appendChild(body);
    const fit = () => {
      const width = screen.clientWidth;
      if (width <= 0) return;
      const scale = width / DESIGN_CANVAS.width;
      body.style.transform = `scale(${scale})`;
      screen.style.height = `${DESIGN_CANVAS.height * scale}px`;
    };
    fit();
    // The container is often laid out after this returns (a freshly appended
    // overlay measures 0), so re-fit when it gets a size. ResizeObserver is
    // absent in older WebViews — the initial fit still applies there.
    const RO = (document.defaultView as unknown as { ResizeObserver?: typeof ResizeObserver })?.ResizeObserver;
    if (typeof RO === 'function') new RO(fit).observe(screen);
    return screen;
  }

  body.style.display = 'flex';
  body.style.flexDirection = 'column';
  screen.appendChild(body);
  return screen;
}
