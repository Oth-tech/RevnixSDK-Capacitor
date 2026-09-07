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
//     never be shown a price the store will not charge. Outside a package
//     card a tag reads the SELECTED package (render contract v2 §2), so the
//     renewal line every template carries shows the price the CTA buys.

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

/** What tapping a block does. Omitted means the block is decoration.
 *
 *  A FIELD on the existing block types rather than a new block type, so an SDK
 *  older than this one drops it and still renders the element exactly as it
 *  does today — a design carrying a close chip degrades to inert rather than
 *  losing the chip, which is what a new block type would have cost. */
export type BlockAction = 'close';

/** When a block is drawn, relative to the selected package (render contract
 *  v2, REV-262). `selected` draws it only inside a package card whose package
 *  is the selected one; `unselected` only inside one whose package is not.
 *  Outside any package card the field is ignored and the block is always
 *  drawn — a root-level block can never disappear. */
export type BlockVisibility = 'selected' | 'unselected';

/** The fields every block type carries (render contract v2, REV-262).
 *
 *  `selectedStyle` and `visibility` are valid on EVERY block, not only the
 *  package cards: a radio dot, a "Selected" caption or a checkmark deep inside
 *  a plan card answers to the card's selection through them. See
 *  `resolveSelectedContext` for what "selected" means at each depth. */
export interface BlockBase {
  id: string;
  style?: BlockStyle;
  /** Merged over `style`, field by field, while the block is in selected
   *  context. */
  selectedStyle?: BlockStyle;
  visibility?: BlockVisibility;
}

export interface TextBlock extends BlockBase {
  type: 'text';
  text: string;
  /** Tapping this block dismisses the paywall. See BlockAction. */
  action?: BlockAction;
}

export interface ImageBlock extends BlockBase {
  type: 'image';
  url?: string;
  shape?: 'rect' | 'circle';
  fit?: 'cover' | 'contain';
  placeholder?: string;
  /** Tapping this block dismisses the paywall. See BlockAction. */
  action?: BlockAction;
}

export interface ListBlock extends BlockBase {
  type: 'list';
  items: Array<{ icon?: string; title: string; description?: string }>;
  iconColor?: string;
}

export interface ProductsBlock extends BlockBase {
  type: 'products';
  direction?: 'column' | 'row';
  titleTpl?: string;
  priceTpl?: string;
  highlightSub?: string;
  badgeText?: string;
  cardStyle?: BlockStyle;
  highlightStyle?: BlockStyle;
}

export interface ButtonBlock extends BlockBase {
  type: 'button';
  label: string;
  /** `close` turns this button into a dismiss ("Not now") instead of the
   *  purchase CTA, which is what a button means by default. */
  action?: BlockAction;
}

export interface LinksBlock extends BlockBase {
  type: 'links';
  showRestore?: boolean;
  showTerms?: boolean;
  showPrivacy?: boolean;
  termsUrl?: string;
  privacyUrl?: string;
}

export interface LineBlock extends BlockBase {
  type: 'line';
}

export interface SpacerBlock extends BlockBase {
  type: 'spacer';
  flex?: boolean;
}

/** The one container block. `layout` picks how children are placed: column /
 *  row are flex lines, `stack` layers them (children position with
 *  style.inset or the edge offsets), and `grid` is an N-column grid. */
export interface CardBlock extends BlockBase {
  type: 'card';
  layout?: 'column' | 'row' | 'stack' | 'grid';
  repeat?: 'packages';
  packageIndex?: number;
  columns?: number;
  gridColumns?: string;
  children: PaywallBlock[];
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
  /** REV-271: the language the blocks' own copy is written in. Absent = "en".
   *  Never a key in `locales` — the tree IS that language's version. */
  defaultLocale?: string;
  /** REV-271: translations, keyed by BCP-47 tag then by block string key
   *  (`<blockId>.text`, `<blockId>.items.0.title`, …). Only words differ per
   *  language; styles, layout and ids are shared. `renderRevnixPaywall`
   *  applies the right one — see ./locale.ts. */
  locales?: Record<string, Record<string, string>>;
}

/** The device screen `canvas` designs are authored against. */
export const DESIGN_CANVAS = { width: 393, height: 852 };

/** The widest a canvas design scales to (render contract v2). A phone-authored
 *  design never grows past ~1.22×; on a tablet or in landscape it is centred
 *  in the viewport and the screen background fills the space around it. */
export const CANVAS_MAX_WIDTH = 480;

/** How a canvas design maps onto one viewport, in CSS px. */
export interface CanvasMetrics {
  /** Uniform scale: min(viewportWidth, CANVAS_MAX_WIDTH) / 393. */
  scale: number;
  /** Left offset of the scaled design, so it sits centred when the viewport
   *  is wider than the design can grow. */
  left: number;
  /** The body's layout height in DESIGN units: 852, or more when the viewport
   *  is taller than the scaled design — root cards with `height: "100%"` and
   *  bottom-anchored groups follow it, exactly as the web preview does in a
   *  taller frame. */
  designHeight: number;
  /** The screen's height in CSS px: `designHeight * scale`. Never shorter than
   *  the viewport, so the background fills it and no band is left below. */
  height: number;
  /** True when the scaled design is taller than the viewport and has to
   *  scroll. When it fits, scrolling is off entirely. */
  overflows: boolean;
}

/**
 * Pure canvas layout arithmetic (render contract v2 §3). Kept separate from
 * the DOM so the rule — width-scaled, capped, centred, height-filling — is
 * testable without a layout engine. A viewport height of 0 (not laid out
 * yet) leaves the design at its authored 852.
 */
export function canvasMetrics(viewportWidth: number, viewportHeight: number): CanvasMetrics {
  const scale = Math.min(Math.max(viewportWidth, 0), CANVAS_MAX_WIDTH) / DESIGN_CANVAS.width;
  const designHeight =
    viewportHeight > 0 && scale > 0
      ? Math.max(DESIGN_CANVAS.height, viewportHeight / scale)
      : DESIGN_CANVAS.height;
  const height = designHeight * scale;
  const left = Math.max(0, (viewportWidth - DESIGN_CANVAS.width * scale) / 2);
  const overflows = viewportHeight > 0 && height > viewportHeight + 1;
  return { scale, left, designHeight, height, overflows };
}

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

/** How a background photo fills the screen. */
export type BackgroundFit = 'cover' | 'contain';

export interface BackgroundImage {
  /** An https URL the device can load — Convex storage or any CDN. */
  url: string;
  /** Default "cover". */
  fit?: BackgroundFit;
  /** Focal point in percent (0-100, 50/50 = centred): the part of the photo
   *  that must survive a cover-crop. */
  focalX?: number;
  focalY?: number;
  /** 0-100, default 100. */
  opacity?: number;
  /** Gaussian blur radius in px. */
  blur?: number;
}

export interface BackgroundOverlay {
  /** Any CSS color or gradient, painted over the photo. */
  fill: string;
  /** 0-100, default 100. */
  opacity?: number;
}

/**
 * The layered background, as the dashboard writes it.
 *
 * The ground field is `color`. It is NOT `ground` — that is the name of the
 * RESOLVED layer this SDK paints, and reading it off the wire was the bug
 * that rendered every edited paywall black. `ground` stays accepted so a
 * document published by a build that wrote it still opens.
 */
export interface PaywallBackgroundSpec {
  color?: string;
  /** @deprecated Never written by the dashboard; read for safety only. */
  ground?: string;
  image?: BackgroundImage;
  overlay?: BackgroundOverlay;
  /** Builder bookkeeping; ignored on device. */
  presetId?: string;
  original?: unknown;
}

export type PaywallBackground = string | PaywallBackgroundSpec;

const DEFAULT_GROUND = '#000000';

/** The wire value as a spec. A plain string is the legacy ground. */
function backgroundSpec(background: unknown): PaywallBackgroundSpec {
  if (typeof background === 'string') return { color: background };
  if (typeof background === 'object' && background !== null) {
    return background as PaywallBackgroundSpec;
  }
  return {};
}

/** The ground paint of a background: `color`, or the legacy `ground`. */
function groundOf(background: unknown): string | undefined {
  const spec = backgroundSpec(background);
  const value = spec.color ?? spec.ground;
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * The screen background as a flat color — what paints UNDER the gradient, so
 * a form the gradient parser does not understand still shows a color from the
 * design rather than black.
 *
 * It reads the LAST comma-separated layer, because in CSS the first-listed
 * layer paints on TOP: taking the first color would answer with the
 * translucent accent glow the library's Spotlight and Corner halo presets
 * stack over their base, not with the base itself. Fully transparent stops are
 * skipped for the same reason — a scrim that fades to `…00` says nothing about
 * the ground under it.
 */
export function backgroundBaseColor(background: unknown): string {
  const ground = groundOf(background);
  if (ground === undefined) return DEFAULT_GROUND;
  const layers = splitTopLevel(ground);
  const bottom = layers.length > 0 ? layers[layers.length - 1] : ground;
  const colors = bottom.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/gi);
  if (!colors) return ground;
  return colors.find((color) => (toRgb(color)?.a ?? 1) > 0) ?? colors[0];
}

/** Splits on top-level commas only, so the commas inside `rgba(...)` and
 *  inside a gradient's argument list do not tear a layer in half. */
function splitTopLevel(input: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '(') depth++;
    else if (c === ')') { if (depth > 0) depth--; }
    else if (c === ',' && depth === 0) {
      const piece = input.slice(start, i).trim();
      if (piece) out.push(piece);
      start = i + 1;
    }
  }
  const tail = input.slice(start).trim();
  if (tail) out.push(tail);
  return out;
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

/** True when the string is a CSS gradient rather than a plain color. */
export function isGradient(value: string): boolean {
  return /gradient\s*\(/i.test(value);
}

/**
 * A field that can only ever be ONE color — a border, a shadow, a filter.
 *
 * CSS has no gradient `border-color`, so handing a gradient to the `border`
 * shorthand makes the browser discard the whole declaration and the stroke
 * vanishes with no error. Collapsing it to the color it stands for keeps the
 * stroke visible, which is nearer the design's intent than losing it.
 */
export function flatColor(
  value: string | undefined,
  doc: PaywallBlockDoc,
  onDiagnostic?: (message: string) => void,
): string | undefined {
  const resolved = resolveColor(value, doc);
  if (resolved === undefined || !isGradient(resolved)) return resolved;
  onDiagnostic?.(`gradient flattened in a colour-only field: ${resolved}`);
  return backgroundBaseColor(resolved);
}

/** The screen background's ground layer as a CSS `background` value. The
 *  photo and scrim are separate boxes — see `backgroundLayers`. */
export function backgroundCss(background: unknown): string {
  return groundOf(background) ?? DEFAULT_GROUND;
}

export interface ResolvedBackgroundImage {
  url: string;
  fit: BackgroundFit;
  focalX: number;
  focalY: number;
  /** CSS background-position / object-position ("50% 50%"). */
  position: string;
  /** 0-1. */
  opacity: number;
  /** px; absent when no blur was asked for. */
  blur?: number;
}

export interface ResolvedBackgroundOverlay {
  fill: string;
  /** 0-1. */
  opacity: number;
}

export interface BackgroundLayers {
  /** CSS background value for the ground box, or undefined for none. */
  ground?: string;
  image?: ResolvedBackgroundImage;
  overlay?: ResolvedBackgroundOverlay;
}

/** 0-100 (or undefined) -> 0-1, clamped. */
function bgPct(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value / 100));
}

/** 0-100 (or undefined) -> a clamped percentage number. */
function bgCoord(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 50;
  return Math.min(100, Math.max(0, value));
}

/**
 * The paint list for a background, bottom layer first: ground, then photo,
 * then scrim. Layers that would draw nothing (no url, zero opacity) are
 * dropped, so a legacy string resolves to exactly one ground layer.
 *
 * Mirrors revnix-app/src/lib/paywall-blocks/background.ts and the React
 * SDK's blocks/background.ts — same names, same defaults, same clamping.
 */
export function backgroundLayers(
  background: unknown,
  /** Resolves palette tokens in the ground and overlay fills. */
  resolve: (value: string) => string = (v) => v,
): BackgroundLayers {
  const spec = backgroundSpec(background);
  const layers: BackgroundLayers = {};

  const ground = groundOf(background);
  if (ground !== undefined) layers.ground = resolve(ground);

  const image = spec.image;
  if (image && typeof image.url === 'string' && image.url !== '') {
    const opacity = bgPct(image.opacity, 1);
    if (opacity > 0) {
      const focalX = bgCoord(image.focalX);
      const focalY = bgCoord(image.focalY);
      layers.image = {
        url: image.url,
        fit: image.fit === 'contain' ? 'contain' : 'cover',
        focalX,
        focalY,
        position: `${focalX}% ${focalY}%`,
        opacity,
        ...(typeof image.blur === 'number' && image.blur > 0 ? { blur: image.blur } : {}),
      };
    }
  }

  const overlay = spec.overlay;
  if (overlay && typeof overlay.fill === 'string' && overlay.fill !== '') {
    const opacity = bgPct(overlay.opacity, 1);
    if (opacity > 0) {
      layers.overlay = { fill: resolve(overlay.fill), opacity };
    }
  }

  return layers;
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
export function applyBlockStyle(
  node: HTMLElement,
  s: BlockStyle | undefined,
  doc: PaywallBlockDoc,
  onDiagnostic?: (message: string) => void,
): void {
  if (!s) return;
  const css = node.style;
  const color = (v: string | undefined) => resolveColor(v, doc);
  // `background` takes a gradient; a border, shadow or filter does not, and
  // an invalid value there is dropped silently by the CSSOM.
  const flat = (v: string | undefined) => flatColor(v, doc, onDiagnostic);

  if (s.fill !== undefined) css.background = color(s.fill) ?? '';
  if (s.fillSize !== undefined) css.backgroundSize = s.fillSize;
  if (s.textColor !== undefined) css.color = color(s.textColor) ?? '';
  if (s.opacity !== undefined) css.opacity = String(s.opacity / 100);
  if (s.borderColor !== undefined || s.borderWidth !== undefined) {
    css.border = `${s.borderWidth ?? 1}px solid ${flat(s.borderColor) ?? doc.textColor}`;
  }
  if (s.borderTop !== undefined) css.borderTop = flat(s.borderTop) ?? '';
  if (s.borderRight !== undefined) css.borderRight = flat(s.borderRight) ?? '';
  if (s.borderBottom !== undefined) css.borderBottom = flat(s.borderBottom) ?? '';
  if (s.borderLeft !== undefined) css.borderLeft = flat(s.borderLeft) ?? '';
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
  if (s.shadow !== undefined) css.boxShadow = flat(s.shadow) ?? '';
  if (s.blur !== undefined) css.backdropFilter = `blur(${s.blur}px)`;
  if (s.filter !== undefined) css.filter = flat(s.filter) ?? '';
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
  /** The host's resolved selection — `selectedPackageId`, else the last tap,
   *  else `config.highlightPackageId`. When it names an offered package it is
   *  THE selected package: what the plan cards emphasise, what the CTA buys,
   *  and what every tag outside a package card resolves against. Otherwise
   *  the first package is. */
  highlightPackageId?: string;
  /** True while a purchase is in flight (render contract v2 §4): purchase
   *  buttons disable, hide their label and spin in `accentInk`. Close-action
   *  buttons are unaffected. */
  loading?: boolean;
  /** The scrolling box the screen fills. A `canvas` design extends to its
   *  height instead of leaving a band, and switches its scrolling off while
   *  the design fits (render contract v2 §3). Omitted, the window's inner
   *  height stands in and nothing else is touched. */
  viewport?: HTMLElement;
  /** Fills an image block that publishes no URL of its own. */
  heroImageUrl?: string;
  /** Paywall-level Terms/Privacy, used when a links block sets none. */
  footer?: { termsUrl?: string; privacyUrl?: string };
  onRestore?: () => void;
  onTerms?: () => void;
  onPrivacy?: () => void;
  /** Pressing the purchase button, with the package it would buy. The id is
   *  passed rather than read from the host's own state so the button can
   *  never charge for a package other than the selected one. */
  onPurchase?: (packageId: string) => void;
  /** Reports a plan card tap. Selection is the paywall's own state, so a
   *  design's plan cards work without the host wiring anything. */
  onSelect?: (packageId: string) => void;
  /** Dismissal (REV-252). Omitted means no close is drawn at all — a dead
   *  close button is worse than none. */
  onClose?: () => void;
  /** Where the renderer reports a paint string it could not read. Local only —
   *  it never leaves the device. The WebView paints CSS gradients natively, so
   *  this fires only for the colour-only fields CSS itself rejects. */
  onDiagnostic?: (message: string) => void;
}

/**
 * The package the tree treats as selected: the host's resolved selection when
 * it is still on offer, else the first package. Shared by the plan cards and
 * the CTA so a design can never highlight one package and charge for another.
 */
function selectedPackageId(ctx: BlockRenderContext): string | undefined {
  const { packages, highlightPackageId } = ctx;
  return highlightPackageId && packages.some((p) => p.packageId === highlightPackageId)
    ? highlightPackageId
    : packages[0]?.packageId;
}

/** The selected package itself — see `selectedPackageId`. */
export function selectedPackage(ctx: BlockRenderContext): BlockPackage | undefined {
  const id = selectedPackageId(ctx);
  return id === undefined ? undefined : ctx.packages.find((p) => p.packageId === id);
}

// ——— selected context (render contract v2 §1) ———

/**
 * Where in the tree a block is being drawn.
 *
 * A package card — a card pinned with `packageIndex`, or one instance of a
 * `repeat: "packages"` card — opens a scope for its package, and every
 * descendant inherits it until a nearer package card overrides it. At the
 * root there is no package card, so `selected` is false, `visibility` is not
 * honoured (a root block is always drawn) and tags resolve against the
 * selected package.
 */
export interface BlockScope {
  /** The package tags resolve against. */
  pkg?: BlockPackage;
  /** True inside a package card whose package is the selected one. */
  selected: boolean;
  /** True once inside any package card. `selectedStyle` and `visibility`
   *  only take effect here. */
  inPackageCard: boolean;
}

/** The scope the root blocks are drawn in: the selected package, unselected
 *  context — so a renewal line outside any card reads the price the CTA
 *  buys, and a `visibility` on a root block never hides it. */
export function rootScope(ctx: BlockRenderContext): BlockScope {
  return { pkg: selectedPackage(ctx), selected: false, inPackageCard: false };
}

/** The scope a package card opens for `pkg`. */
export function packageScope(ctx: BlockRenderContext, pkg: BlockPackage | undefined): BlockScope {
  return {
    pkg,
    selected: pkg !== undefined && pkg.packageId === selectedPackageId(ctx),
    inPackageCard: true,
  };
}

/**
 * The scope `block` is drawn in, given the scope of its parent.
 *
 * Only a package card changes scope; every other block — including a plain
 * card — inherits its parent's. A `repeat` card is resolved per instance by
 * `renderCard` (it has one scope per package), so here it inherits.
 */
export function resolveSelectedContext(block: PaywallBlock, ctx: BlockRenderContext, parent: BlockScope): BlockScope {
  if (block.type !== 'card' || block.repeat !== undefined || block.packageIndex === undefined) return parent;
  const pinned = ctx.packages[block.packageIndex];
  return pinned === undefined ? parent : packageScope(ctx, pinned);
}

/** `style`, with `selectedStyle` merged over it field by field while the
 *  block is in selected context. */
export function effectiveStyle(block: BlockBase, scope: BlockScope): BlockStyle | undefined {
  if (!scope.selected || !block.selectedStyle) return block.style;
  return { ...(block.style ?? {}), ...block.selectedStyle };
}

/** Whether `block` is drawn at all in `scope`. `visibility` is ignored outside
 *  a package card: a root block is never hidden. */
export function isVisible(block: BlockBase, scope: BlockScope): boolean {
  const visibility = block.visibility;
  if (visibility === undefined || !scope.inPackageCard) return true;
  if (visibility === 'selected') return scope.selected;
  if (visibility === 'unselected') return !scope.selected;
  // A visibility value this SDK does not know: draw rather than hide, the
  // same way an unknown style field is ignored.
  return true;
}

/** Makes a card its package's selection target. Deliberately no pressed
 *  feedback: the card's `selectedStyle` is its answer to a tap. */
function makeSelectable(node: HTMLElement, ctx: BlockRenderContext, packageId: string): void {
  if (!ctx.onSelect) return;
  node.style.cursor = 'pointer';
  node.addEventListener('click', () => ctx.onSelect?.(packageId));
}

// ——— the renderer's own stylesheet ———

const BLOCK_STYLE_ID = 'rvx-block-styles';
const BUTTON_CLASS = 'rvx-block-button';
const SPINNER_CLASS = 'rvx-block-spinner';

/** The handful of rules inline styles cannot express: the pressed state of a
 *  button (`:active`, so it works for touch as well as a pointer and needs no
 *  hover) and the spinner's animation. Injected once per document. */
const BLOCK_CSS = `
.${BUTTON_CLASS}:active { opacity: 0.8; }
.${BUTTON_CLASS}[disabled] { cursor: default; }
.${SPINNER_CLASS} { animation: rvx-block-spin 0.8s linear infinite; }
@keyframes rvx-block-spin { to { transform: rotate(360deg); } }
`;

export function ensureBlockStyles(document: Document): void {
  if (document.getElementById(BLOCK_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = BLOCK_STYLE_ID;
  style.textContent = BLOCK_CSS;
  (document.head ?? document.documentElement).appendChild(style);
}

/**
 * Makes an element the paywall's dismiss target when the design marks it as
 * one (REV-252). A block with no close action gets no listener at all, so it
 * never intercepts a tap meant for what sits behind it.
 */
function makeClosable(node: HTMLElement, ctx: BlockRenderContext, action: BlockAction | undefined): void {
  if (action !== 'close' || !ctx.onClose) return;
  node.style.cursor = 'pointer';
  node.setAttribute('role', 'button');
  node.setAttribute('aria-label', 'Close');
  node.addEventListener('click', (event) => {
    // Consumes its own tap: a close chip pinned over a plan card would
    // otherwise also bubble into that card's selection handler.
    event.stopPropagation();
    ctx.onClose?.();
  });
}

/**
 * Does this tree author its own dismiss affordance?
 *
 * The renderer draws its own close button only when this is false, so a design
 * published before close existed becomes dismissible without being
 * re-authored, and a design that DOES author a close chip never shows two. The
 * same predicate exists in every Revnix SDK — keep them identical.
 *
 * Conditional containers are deliberately not searched: a `repeat` card
 * renders once per package (none, when the offering is empty) and a
 * `packageIndex` card is hidden when the offering does not reach that index,
 * so a close authored inside one MIGHT not appear. Counting it would suppress
 * the fallback and leave the customer with no way out — the exact bug this
 * feature exists to fix. A block with `visibility` set is conditional in the
 * same way (render contract v2) and is skipped for the same reason.
 */
export function hasCloseAction(blocks: PaywallBlock[]): boolean {
  return blocks.some((b) => {
    if (typeof b !== 'object' || b === null || b.visibility !== undefined) return false;
    return b.type === 'card'
      ? b.repeat === undefined && b.packageIndex === undefined && hasCloseAction(b.children)
      : (b.type === 'text' || b.type === 'image' || b.type === 'button') && b.action === 'close';
  });
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
  parent: BlockScope = rootScope(ctx),
): HTMLElement | null {
  if (typeof block !== 'object' || block === null) return null;
  // A package card is judged in the scope it opens (its own package selected
  // or not); everything else in the scope it inherits. A `repeat` card is
  // judged per instance, inside renderCard.
  if (!isVisible(block, resolveSelectedContext(block, ctx, parent))) return null;
  const node = renderBlockIn(block, ctx, document, parent);
  // The id travels into the DOM so a host (and the contract tests) can find a
  // block by the name the design gave it. A `repeat` wrapper is display:
  // contents and stamps its instances instead.
  if (node && typeof block.id === 'string' && node.style.display !== 'contents') {
    node.setAttribute('data-block-id', block.id);
  }
  return node;
}

function renderBlockIn(
  block: PaywallBlock,
  ctx: BlockRenderContext,
  document: Document,
  parent: BlockScope,
): HTMLElement | null {
  const { doc, packages } = ctx;
  // Every block but a package card draws in its parent's scope; a package
  // card opens its own (renderCard handles the per-instance `repeat` case).
  const scope = resolveSelectedContext(block, ctx, parent);
  const pkg = scope.pkg;
  const style = effectiveStyle(block, scope);

  switch (block.type) {
    case 'text': {
      const node = div(document);
      const s = style;
      // A text block that asks for cross/main-axis alignment (the ×-close
      // chip, centered badges) is a flex box in the source design; without
      // display:flex those properties are inert and the glyph sits top-left.
      if (s?.items !== undefined || s?.justify !== undefined) node.style.display = 'flex';
      applyBlockStyle(node, s, doc, ctx.onDiagnostic);
      node.textContent = resolveTags(String(block.text ?? ''), pkg, packages);
      makeClosable(node, ctx, block.action);
      return node;
    }

    case 'image': {
      const node = div(document);
      const url = block.url || ctx.heroImageUrl;
      const s = style;
      // The 160px/16px defaults suit a slot dropped into a flow column; a
      // converted design sizes its own slot, and the defaults must not fight it.
      const sized =
        s !== undefined &&
        (Boolean(s.inset) ||
          s.height !== undefined ||
          s.aspectRatio !== undefined ||
          (s.top !== undefined && s.bottom !== undefined) ||
          s.flex !== undefined);
      // A full-screen photo: the design's own art, and the first thing the
      // customer sees. It fills its stack parent on both axes and is fetched
      // and decoded eagerly, so nothing about it changes first paint.
      const fullScreen = s !== undefined && (Boolean(s.inset) || (s.top !== undefined && s.bottom !== undefined));
      if (!sized) node.style.height = '160px';
      if (s?.inset) {
        node.style.width = '100%';
        node.style.height = '100%';
      }
      node.style.borderRadius = block.shape === 'circle' ? '50%' : sized ? '0' : '16px';
      node.style.overflow = 'hidden';
      node.style.flexShrink = '0';
      applyBlockStyle(node, s, doc, ctx.onDiagnostic);
      if (url) {
        const img = document.createElement('img');
        img.src = url;
        img.alt = '';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = block.fit ?? 'cover';
        img.style.display = 'block';
        if (!fullScreen) {
          // An in-flow slot may sit below the fold; let the WebView defer it
          // and decode it off the main thread. Attributes rather than the
          // properties: a WebView that predates them ignores an attribute.
          img.setAttribute('loading', 'lazy');
          img.setAttribute('decoding', 'async');
        }
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
      makeClosable(node, ctx, block.action);
      return node;
    }

    case 'list': {
      const node = div(document);
      node.style.display = 'flex';
      node.style.flexDirection = 'column';
      node.style.gap = px(style?.gap ?? 8);
      node.style.textAlign = 'left';
      applyBlockStyle(node, style, doc, ctx.onDiagnostic);
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
      return renderProducts(block, ctx, document, style);

    case 'button': {
      const node = div(document, 'button');
      (node as HTMLButtonElement).type = 'button';
      node.className = BUTTON_CLASS;
      // A converted CTA sizes itself with an explicit height and centers with
      // flex; the padded default is only for buttons added by hand.
      const sized = style?.height !== undefined;
      // A button the design marks as the close dismisses instead of buying,
      // and takes no accent fill: the CTA must stay the one accented thing on
      // the screen, or a "Not now" competes with "Subscribe" for the eye.
      const closes = block.action === 'close' && ctx.onClose !== undefined;
      // A purchase in flight (render contract v2 §4): the button disables,
      // hides its label and spins in its place. It keeps its size and fill —
      // the spinner is centred over a hidden label, not swapped in for it —
      // so the screen does not reflow while the store answers.
      const loading = !closes && ctx.loading === true;
      node.style.background = closes ? 'transparent' : doc.accent;
      node.style.color = closes ? doc.textColor : doc.accentInk;
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
      // The spinner is absolutely centred, so the button must be its
      // containing block. Set before the design's own style so a pinned
      // (absolute) button keeps its placement.
      if (loading) node.style.position = 'relative';
      applyBlockStyle(node, style, doc, ctx.onDiagnostic);
      const text = resolveTags(String(block.label ?? ''), pkg, packages);
      if (loading) {
        const label = div(document, 'span');
        label.textContent = text;
        label.style.visibility = 'hidden';
        node.appendChild(label);
        const spinner = div(document);
        spinner.className = SPINNER_CLASS;
        spinner.style.cssText =
          'position:absolute;top:0;right:0;bottom:0;left:0;margin:auto;width:20px;height:20px;' +
          'border-radius:50%;border-width:2px;border-style:solid;pointer-events:none';
        spinner.style.borderColor = doc.accentInk;
        spinner.style.borderTopColor = 'transparent';
        node.appendChild(spinner);
        (node as HTMLButtonElement).disabled = true;
        node.setAttribute('aria-disabled', 'true');
        node.setAttribute('aria-busy', 'true');
      } else {
        node.textContent = text;
      }
      if (closes) {
        makeClosable(node, ctx, block.action);
      } else if (ctx.onPurchase) {
        node.addEventListener('click', (event) => {
          // Consumes its own tap, the way RN's Pressable does. A CTA sitting
          // inside a plan card would otherwise also bubble to the card's
          // selection handler — charging the previously selected package and
          // only then moving the selection onto the one just clicked.
          event.stopPropagation();
          // `disabled` already swallows the tap while loading; this is the
          // guard for a synthetic click that bypasses it.
          if (ctx.loading) return;
          const id = selectedPackageId(ctx);
          if (id !== undefined) ctx.onPurchase?.(id);
        });
      }
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
      applyBlockStyle(node, style, doc, ctx.onDiagnostic);
      for (const entry of entries) {
        // An explicit host handler wins over the config URL — the app knows
        // best how to open its own legal pages; the URL is the fallback.
        if (entry.onPress) {
          const button = div(document, 'span');
          button.style.cursor = 'pointer';
          button.setAttribute('role', 'button');
          button.setAttribute('tabindex', '0');
          button.textContent = entry.label;
          // Consumes its own tap, so Restore inside a plan card does not also
          // select that card.
          button.addEventListener('click', (event) => {
            event.stopPropagation();
            entry.onPress?.();
          });
          node.appendChild(button);
        } else if (entry.url) {
          const anchor = document.createElement('a');
          anchor.href = entry.url;
          anchor.target = '_blank';
          anchor.rel = 'noopener noreferrer';
          anchor.style.cursor = 'pointer';
          anchor.style.color = 'inherit';
          anchor.textContent = entry.label;
          // Same rule as the handler branch: following a link out of a plan
          // card must not also change which package the CTA buys.
          anchor.addEventListener('click', (event) => event.stopPropagation());
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
      applyBlockStyle(node, style, doc, ctx.onDiagnostic);
      return node;
    }

    case 'spacer': {
      const node = div(document);
      if (block.flex) {
        node.style.flex = '1';
      } else {
        node.style.height = '16px';
        applyBlockStyle(node, style, doc, ctx.onDiagnostic);
      }
      return node;
    }

    case 'card':
      return renderCard(block, ctx, document, parent);

    default:
      // An unknown block type from a newer dashboard: skip this node, keep
      // the screen. Never crash, never blank.
      return null;
  }
}

function containerBase(block: CardBlock, node: HTMLElement, style: BlockStyle | undefined): void {
  const layout = block.layout ?? 'column';
  // Every container is a positioning context, so a child pinned with
  // top/right offsets (a SAVE badge on a plan card) anchors to its own card
  // rather than the screen.
  node.style.position = 'relative';
  if (layout === 'stack') return;
  if (layout === 'grid') {
    node.style.display = 'grid';
    node.style.gridTemplateColumns = block.gridColumns ?? `repeat(${block.columns ?? 2}, minmax(0, 1fr))`;
    node.style.gap = px(style?.gap ?? 10);
    return;
  }
  // column / row — and any layout value this SDK does not know, which falls
  // back to a column rather than rendering nothing.
  node.style.display = 'flex';
  node.style.flexDirection = layout === 'row' ? 'row' : 'column';
  node.style.gap = px(style?.gap ?? 10);
}

function renderCard(
  block: CardBlock,
  ctx: BlockRenderContext,
  document: Document,
  parent: BlockScope,
): HTMLElement | null {
  const { doc, packages } = ctx;
  const layout = block.layout ?? 'column';
  const children = Array.isArray(block.children) ? block.children : [];

  const fill = (node: HTMLElement, scope: BlockScope) => {
    for (const child of children) {
      const rendered = renderBlock(child, ctx, document, scope);
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
      // Each instance opens its own scope: the selected package's instance
      // takes `selectedStyle`, and its descendants see `selected` too.
      const scope = packageScope(ctx, p);
      if (!isVisible(block, scope)) continue;
      const style = effectiveStyle(block, scope);
      const node = div(document);
      containerBase(block, node, style);
      if (layout !== 'stack') node.style.borderRadius = '16px';
      applyBlockStyle(node, style, doc, ctx.onDiagnostic);
      if (p) makeSelectable(node, ctx, p.packageId);
      if (typeof block.id === 'string') node.setAttribute('data-block-id', block.id);
      fill(node, scope);
      wrapper.appendChild(node);
    }
    return wrapper;
  }

  // A card that names a package the offering does not reach is dropped rather
  // than shown with unresolved tags.
  if (block.packageIndex !== undefined && packages[block.packageIndex] === undefined) {
    return null;
  }

  // A card pinned to a package doubles as its selection target — that is how
  // hand-styled plan rows (a highlighted annual beside a plain monthly) become
  // tappable without a products block. It opens the selected context for its
  // subtree: it takes `selectedStyle` when selected, or tapping it would
  // change what the CTA buys with no visible answer, and every descendant
  // (a radio dot, a "Selected" caption) answers to the same state. A card
  // that names no package is decoration, stays inert and inherits its
  // parent's scope.
  const scope = resolveSelectedContext(block, ctx, parent);
  const style = effectiveStyle(block, scope);
  const node = div(document);
  containerBase(block, node, style);
  if (layout !== 'stack') node.style.borderRadius = '16px';
  applyBlockStyle(node, style, doc, ctx.onDiagnostic);
  const pinned = block.packageIndex !== undefined ? packages[block.packageIndex] : undefined;
  if (pinned) makeSelectable(node, ctx, pinned.packageId);
  fill(node, scope);
  return node;
}

function renderProducts(
  block: ProductsBlock,
  ctx: BlockRenderContext,
  document: Document,
  style: BlockStyle | undefined,
): HTMLElement {
  const { doc, packages } = ctx;
  const shown = packages;
  const hlId = selectedPackageId(ctx);
  const row = block.direction === 'row';

  const node = div(document);
  node.style.display = 'flex';
  node.style.flexDirection = row ? 'row' : 'column';
  node.style.gap = px(style?.gap ?? 8);
  applyBlockStyle(node, style, doc, ctx.onDiagnostic);

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
    applyBlockStyle(card, hl ? block.highlightStyle : block.cardStyle, doc, ctx.onDiagnostic);
    // The whole card is the target, not just its glyphs — a plan row is mostly
    // padding, and tapping beside the price must select.
    makeSelectable(card, ctx, pkg.packageId);

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
 * The screen background's photo and scrim as absolutely-positioned boxes,
 * bottom layer first. The ground is painted on the screen element itself, so
 * an unedited paywall (a plain string background) produces no boxes at all
 * and renders byte-identically to before.
 */
function backgroundArt(layers: BackgroundLayers, document: Document): HTMLDivElement[] {
  const out: HTMLDivElement[] = [];
  const fill = (node: HTMLElement) => {
    node.style.position = 'absolute';
    node.style.inset = '0';
    // `inset` is unsupported in older WebViews; the longhands are the ones
    // that actually land there.
    node.style.top = '0';
    node.style.left = '0';
    node.style.right = '0';
    node.style.bottom = '0';
    node.style.pointerEvents = 'none';
  };

  const image = layers.image;
  if (image) {
    const node = box(document);
    fill(node);
    node.style.backgroundImage = `url("${image.url.replace(/"/g, '%22')}")`;
    node.style.backgroundSize = image.fit;
    node.style.backgroundPosition = image.position;
    node.style.backgroundRepeat = 'no-repeat';
    node.style.opacity = String(image.opacity);
    if (image.blur !== undefined) {
      node.style.filter = `blur(${image.blur}px)`;
      // A blurred box bleeds its own transparent edge inward, which reads as
      // a bright rim over the ground. Scaling past the edges hides it.
      node.style.transform = 'scale(1.1)';
      // ...but the scaled box now overhangs the screen, and only the canvas
      // branch clips. Its own clipping wrapper keeps a blurred photo inside
      // the paywall in the flow branch too.
      const clip = box(document);
      fill(clip);
      clip.style.overflow = 'hidden';
      node.style.position = 'absolute';
      clip.appendChild(node);
      out.push(clip);
    } else {
      out.push(node);
    }
  }

  const overlay = layers.overlay;
  if (overlay) {
    const node = box(document);
    fill(node);
    node.style.background = overlay.fill;
    node.style.opacity = String(overlay.opacity);
    out.push(node);
  }

  return out;
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
  ensureBlockStyles(document);
  const screen = box(document);
  const layers = backgroundLayers(doc.background, (v) => resolveColor(v, doc) ?? v);
  if (layers.ground !== undefined) screen.style.background = layers.ground;
  screen.style.color = doc.textColor;
  if (doc.fontFamily) screen.style.fontFamily = `"${doc.fontFamily}", inherit`;

  // The photo and scrim are absolutely positioned, so the screen has to be
  // their containing block. The canvas branch below makes it one anyway; the
  // flow branch only becomes one when there is art to contain, because
  // positioning it changes what a pinned block inside anchors to.
  const art = backgroundArt(layers, document);
  if (art.length > 0) {
    screen.style.position = 'relative';
    screen.style.isolation = 'isolate';
    for (const layer of art) screen.appendChild(layer);
  }

  const body = box(document);
  for (const block of doc.blocks) {
    const rendered = renderBlock(block, ctx, document);
    if (rendered) body.appendChild(rendered);
  }

  // REV-252: the dismiss affordance the renderer supplies itself, drawn only
  // when the design authors none of its own and the host wired an onClose.
  // That rule is what makes every paywall published before close existed
  // dismissible without being re-authored, while a design that DOES carry a
  // close chip never ends up showing two.
  //
  // Appended to the SCREEN rather than the body so it sits outside the canvas
  // scale transform, keeping its tap size and its distance from the screen
  // edge whatever the device width does to the design.
  const closeChip = fallbackClose(ctx, document);

  if (doc.layout === 'canvas') {
    // Laid out at 1× and scaled, so absolute placement inside `stack`
    // containers stays true at any width (render contract v2 §3). The
    // converted designs were drawn against the UA default line height; the
    // host page's own could stretch every label that does not declare one.
    screen.style.position = 'relative';
    screen.style.width = '100%';
    screen.style.flexShrink = '0';
    screen.style.overflow = 'hidden';
    body.style.position = 'absolute';
    body.style.top = '0';
    body.style.left = '0';
    body.style.width = `${DESIGN_CANVAS.width}px`;
    body.style.height = `${DESIGN_CANVAS.height}px`;
    body.style.transformOrigin = 'top left';
    body.style.lineHeight = 'normal';
    body.style.zIndex = '1';
    screen.appendChild(body);
    const viewport = ctx.viewport;
    const measured = viewport ?? screen;
    const fit = () => {
      const width = measured.clientWidth;
      if (width <= 0) return;
      const height = viewport ? viewport.clientHeight : (document.defaultView?.innerHeight ?? 0);
      const m = canvasMetrics(width, height);
      body.style.transform = `scale(${m.scale})`;
      // Centred when the viewport is wider than the design can grow; the
      // extra height is in DESIGN units so the scale maps it exactly.
      body.style.left = `${m.left}px`;
      body.style.height = `${m.designHeight}px`;
      screen.style.height = `${m.height}px`;
      if (viewport) {
        // Scrolling only when the design is taller than the viewport; when it
        // fits, a drag must neither scroll nor bounce the artwork.
        viewport.style.overflowY = m.overflows ? 'auto' : 'hidden';
        viewport.style.overscrollBehavior = m.overflows ? '' : 'none';
      }
    };
    if (closeChip) screen.appendChild(closeChip);
    fit();
    // The container is often laid out after this returns (a freshly appended
    // overlay measures 0), so re-fit when it gets a size. ResizeObserver is
    // absent in older WebViews — the initial fit still applies there.
    const RO = (document.defaultView as unknown as { ResizeObserver?: typeof ResizeObserver })?.ResizeObserver;
    if (typeof RO === 'function') new RO(fit).observe(measured);
    return screen;
  }

  body.style.display = 'flex';
  body.style.flexDirection = 'column';
  if (art.length > 0) {
    body.style.position = 'relative';
    body.style.zIndex = '1';
  }
  screen.appendChild(body);
  if (closeChip) {
    // The chip is absolutely positioned, so the flow screen has to be its
    // containing block even when there is no background art to make it one.
    screen.style.position = 'relative';
    screen.appendChild(closeChip);
  }
  return screen;
}

/**
 * The renderer's own close chip, or null when it should not draw one.
 *
 * Deliberately plain: it is a safety net, not a design element. Tinted from
 * the screen's own ink rather than a fixed white, so it stays legible on a
 * light design as well as a dark one.
 */
function fallbackClose(ctx: BlockRenderContext, document: Document): HTMLElement | null {
  const { onClose, doc } = ctx;
  if (!onClose || hasCloseAction(doc.blocks)) return null;
  const node = div(document, 'button');
  (node as HTMLButtonElement).type = 'button';
  node.setAttribute('aria-label', 'Close');
  node.textContent = '\u00d7';
  node.style.cssText =
    'position:absolute;top:14px;right:14px;z-index:50;width:30px;height:30px;' +
    'display:flex;align-items:center;justify-content:center;border:none;border-radius:999px;' +
    'font-size:17px;line-height:1;cursor:pointer;padding:0';
  // The canvas is full-bleed under the status bar, so the chip clears the
  // safe area in unscaled points (render contract v2 §3). The plain 14px above
  // stays as the fallback: a WebView without env() rejects this assignment
  // and keeps the previous value.
  node.style.top = 'calc(14px + env(safe-area-inset-top))';
  node.style.color = doc.textColor;
  // color-mix keeps the wash tied to the design's ink; a WebView too old for
  // it falls back to the transparent default, leaving a bare glyph that is
  // still tappable.
  node.style.background = `color-mix(in srgb, ${doc.textColor} 14%, transparent)`;
  node.addEventListener('click', (event) => {
    event.stopPropagation();
    onClose();
  });
  return node;
}
