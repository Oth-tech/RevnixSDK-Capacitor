// renderRevnixPaywall — renders a published PaywallConfig exactly as the
// dashboard paywall-builder previews it. Framework-free DOM port of the React
// Native renderer in revnix-react (src/ui/RevnixPaywall.tsx) — that file and
// PaywallPhonePreview.tsx in revnix-app are the reference renderers; keep the
// three in lockstep (every layout, block, and style value here mirrors the
// same-named block there, RN dp values carried over 1:1 as CSS px). The config
// decides template, copy, accent, badge, highlight, and hero image; the app
// supplies package titles/prices (from StoreKit / Play Billing) and the
// purchase handlers, so the display never disagrees with the charge.
//
// `template` is a LAYOUT id. "focus" | "feature-list" | "minimal" are the
// original three and render byte-identically to the other SDKs' renderers;
// the newer layouts (hero, timeline, plans, feature-grid, offer, reveal) are
// distinct screen structures the dashboard's template gallery presets over.
// An unrecognized template (config published by a newer dashboard) falls
// back to the classic structure instead of rendering nothing.
//
// Capacitor apps run inside a WebView on every platform, so this one DOM
// renderer covers iOS, Android, and web. No framework, no dependencies —
// part of the main bundle: `import { renderRevnixPaywall } from
// 'revnix-capacitor'`. The host container must have a height (a full-screen
// overlay is the usual shape); the paywall fills it and scrolls internally.

import type { PaywallConfig } from './definitions';

/** One purchasable row. `priceLabel` must come from the store (localized). */
export interface RevnixPaywallPackage {
  packageId: string;
  title: string;
  priceLabel: string;
}

/** Colors the paywall renders with. Defaults mirror the dashboard preview
 *  chrome (a fixed dark screen) — override to match the host app's theme. */
export interface RevnixPaywallTheme {
  background: string;
  textPrimary: string;
  textSecondary: string;
  textFaint: string;
  border: string;
  /** Text color on accent-filled surfaces (CTA, badge). */
  accentInk: string;
}

export const DEFAULT_PAYWALL_THEME: RevnixPaywallTheme = {
  background: '#0f1116',
  textPrimary: '#ffffff',
  textSecondary: '#9aa0a8',
  textFaint: '#6b7078',
  border: '#2a2e36',
  accentInk: '#0a0b0d',
};

/** Base theme when the dashboard config sets `mode: "light"`. Keep in
 *  lockstep with the builder preview (PaywallPhonePreview SCREEN_PALETTES). */
export const LIGHT_PAYWALL_THEME: RevnixPaywallTheme = {
  background: '#ffffff',
  textPrimary: '#16181d',
  textSecondary: '#5b6068',
  textFaint: '#9aa0a8',
  border: '#e2e5ea',
  accentInk: '#ffffff',
};

const DEFAULT_ACCENT = '#6478ff';

// Currency symbols the anchor-price guard recognizes (majors; a symbol-less
// anchor can't be judged and renders as entered).
const CURRENCY_SYMBOL = /[$€£¥₹₩₽₺₫₪฿₴₦₱]/;

// Soft card surface used by the feature-grid / reveal / review blocks. Not
// part of the public theme — derived from the config's mode, in lockstep
// with the dashboard preview's SCREEN_PALETTES.card.
const CARD_BG = { dark: '#181b22', light: '#f4f5f7' } as const;

export interface RevnixPaywallOptions {
  config: PaywallConfig;
  packages: RevnixPaywallPackage[];
  /** Called with the selected packageId when the CTA is pressed. */
  onPurchase: (packageId: string) => void;
  /** Controlled selection; omit to let the paywall manage it (initial
   *  selection is the config's highlight package, else the first package). */
  selectedPackageId?: string;
  onSelectPackage?: (packageId: string) => void;
  /** Renders a spinner in the CTA and disables purchasing. */
  loading?: boolean;
  onRestore?: () => void;
  onTerms?: () => void;
  onPrivacy?: () => void;
  theme?: Partial<RevnixPaywallTheme>;
  /** When given, the paywall reports one paywall.viewed per render-mount
   *  (REV-094) — the analytics funnel's "Paywall displayed" stage. The
   *  `Revnix` plugin satisfies this shape; structural typing keeps this
   *  entrypoint free of a hard plugin import. */
  client?: {
    logPaywallShown: (options?: { placementKey?: string; paywallId?: string }) => void | Promise<void>;
  };
  /** Placement/paywall attribution attached to the view report. */
  placementKey?: string;
  paywallId?: string;
  /** Opt out of the automatic view report while still passing `client`. */
  disableViewTracking?: boolean;
}

export interface RevnixPaywallHandle {
  /** Re-render with the given options merged over the current ones (e.g.
   *  `{ loading: true }` while a purchase is in flight). Never re-reports the
   *  paywall view — only a fresh `renderRevnixPaywall` (a genuine re-shown
   *  paywall) does. */
  update(options: Partial<RevnixPaywallOptions>): void;
  /** Remove the paywall from the container. The handle is dead afterwards. */
  destroy(): void;
}

/**
 * Render a paywall into `container` and return a handle for updates.
 * The container must have a height; the paywall fills it, centers its content
 * vertically on tall viewports, and scrolls internally on overflow.
 */
export function renderRevnixPaywall(container: HTMLElement, options: RevnixPaywallOptions): RevnixPaywallHandle {
  return new RevnixPaywallRenderer(container, options);
}

// ——— DOM implementation ———

const STYLE_ID = 'rvx-paywall-styles';

class RevnixPaywallRenderer implements RevnixPaywallHandle {
  private options: RevnixPaywallOptions;
  private readonly root: HTMLDivElement;
  private readonly scroll: HTMLDivElement;
  private readonly scrollContent: HTMLDivElement;
  private content: HTMLDivElement | null = null;
  private internalSelected: string | undefined = undefined;
  private destroyed = false;

  constructor(container: HTMLElement, options: RevnixPaywallOptions) {
    this.options = options;
    const doc = container.ownerDocument;
    ensureStyles(doc);
    this.root = el(doc, 'rvx-paywall-root');
    this.scroll = el(doc, 'rvx-paywall-scroll');
    this.scrollContent = el(doc, 'rvx-paywall-scroll-content');
    this.scroll.appendChild(this.scrollContent);
    this.root.appendChild(this.scroll);
    this.render();
    container.appendChild(this.root);

    // One view per mount: a fresh renderRevnixPaywall (a re-shown paywall) is
    // a genuine new display; `update()` re-renders are not. The report is a
    // fire-and-forget beacon — a failed delivery never breaks the paywall.
    const { client, placementKey, paywallId, disableViewTracking } = options;
    if (client && !disableViewTracking) {
      void Promise.resolve(client.logPaywallShown({ placementKey, paywallId })).catch(() => undefined);
    }
  }

  update(options: Partial<RevnixPaywallOptions>): void {
    if (this.destroyed) return;
    this.options = { ...this.options, ...options };
    this.render();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.root.remove();
  }

  private select(packageId: string): void {
    this.internalSelected = packageId;
    this.options.onSelectPackage?.(packageId);
    this.render();
  }

  private render(): void {
    const o = this.options;
    const { config, packages, loading } = o;
    const doc = this.root.ownerDocument;

    // Base scheme comes from the dashboard config (mode: dark|light, absent =
    // dark for legacy configs); the host's explicit theme option wins on top.
    const baseTheme = config.mode === 'light' ? LIGHT_PAYWALL_THEME : DEFAULT_PAYWALL_THEME;
    const theme: RevnixPaywallTheme = { ...baseTheme, ...o.theme };
    const accent = config.accent ?? DEFAULT_ACCENT;
    const cardBg = CARD_BG[config.mode === 'light' ? 'light' : 'dark'];
    const layout = config.template;

    // Same template semantics as the dashboard preview: "minimal" shows only
    // the highlighted package; feature bullets render on the feature layouts.
    const shown =
      layout === 'minimal' && config.highlightPackageId
        ? packages.filter((p) => p.packageId === config.highlightPackageId)
        : packages;

    const fallbackSelected: string | undefined =
      shown.find((p) => p.packageId === config.highlightPackageId)?.packageId ?? shown[0]?.packageId;
    const selectedId =
      o.selectedPackageId ??
      (this.internalSelected !== undefined && shown.some((p) => p.packageId === this.internalSelected)
        ? this.internalSelected
        : fallbackSelected);

    // Footer links are dashboard-configured (config.footer); a legacy config
    // without the field keeps the original always-on footer. Explicit host
    // handlers win over config URLs — the app knows best how to open its own
    // legal pages (in-app browser etc.); the URL is the no-handler fallback
    // (rendered as a plain target=_blank anchor).
    const footer = config.footer;
    const footerItems = [
      { show: footer?.showRestore ?? true, label: 'Restore', onPress: o.onRestore, url: undefined },
      { show: footer?.showTerms ?? true, label: 'Terms', onPress: o.onTerms, url: footer?.termsUrl },
      { show: footer?.showPrivacy ?? true, label: 'Privacy', onPress: o.onPrivacy, url: footer?.privacyUrl },
    ].filter((item) => item.show);

    const textDiv = (className: string, content: string, color?: string): HTMLDivElement => {
      const node = el(doc, className);
      node.textContent = content;
      if (color !== undefined) node.style.color = color;
      return node;
    };

    // Selectable package surface — mirrors the RN Pressable's accessibility
    // props (accessibilityRole="radio" + accessibilityState.selected).
    const radioButton = (className: string, packageId: string, selected: boolean): HTMLButtonElement => {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = className;
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', String(selected));
      button.setAttribute('data-rvx-key', `pkg:${packageId}`);
      button.addEventListener('click', () => this.select(packageId));
      return button;
    };

    // ——— shared blocks (each layout composes a subset; keep every block in
    // lockstep with the same-named block in RevnixPaywall.tsx) ———

    // Classic header: hero image card (or accent icon tile) + centered
    // headline/subheadline. Byte-identical to the pre-layout renderer.
    const heroOrIcon = (): HTMLElement => {
      if (config.heroImageUrl) {
        const img = doc.createElement('img');
        img.className = 'rvx-paywall-hero-image';
        img.src = config.heroImageUrl;
        img.alt = '';
        return img;
      }
      const tile = el(doc, 'rvx-paywall-icon-tile');
      tile.style.backgroundColor = `${accent}26`;
      tile.appendChild(textDiv('rvx-paywall-icon-glyph', '◆', accent));
      return tile;
    };

    const headlineBlock = (): HTMLElement[] => {
      const nodes = [textDiv('rvx-paywall-headline', config.headline, theme.textPrimary)];
      if (config.subheadline) {
        nodes.push(textDiv('rvx-paywall-subheadline', config.subheadline, theme.textSecondary));
      }
      return nodes;
    };

    // Hero layout banner: full-width media with a content-safe scrim overlay
    // carrying the headline/subheadline (always light-on-scrim). Falls back to
    // an accent field with the brand glyph when no hero image is set.
    const heroBanner = (): HTMLElement => {
      const banner = el(doc, 'rvx-paywall-hero-banner');
      if (config.heroImageUrl) {
        const img = doc.createElement('img');
        img.className = 'rvx-paywall-hero-banner-fill';
        img.src = config.heroImageUrl;
        img.alt = '';
        banner.appendChild(img);
      } else {
        const fill = el(doc, 'rvx-paywall-hero-banner-fill');
        fill.style.backgroundColor = accent;
        banner.appendChild(fill);
        const glyphWrap = el(doc, 'rvx-paywall-hero-banner-glyph-wrap');
        glyphWrap.appendChild(textDiv('rvx-paywall-hero-banner-glyph', '◆'));
        banner.appendChild(glyphWrap);
      }
      const scrim = el(doc, 'rvx-paywall-hero-banner-scrim');
      scrim.appendChild(textDiv('rvx-paywall-hero-banner-headline', config.headline));
      if (config.subheadline) {
        scrim.appendChild(textDiv('rvx-paywall-hero-banner-sub', config.subheadline));
      }
      banner.appendChild(scrim);
      return banner;
    };

    // Legacy feature bullets (feature-list layout).
    const featureBullets = (): HTMLElement | null => {
      if (config.features.length === 0) return null;
      const wrap = el(doc, 'rvx-paywall-features');
      for (const f of config.features) {
        const row = el(doc, 'rvx-paywall-feature-row');
        row.appendChild(textDiv('rvx-paywall-feature-icon', f.icon || '✓', accent));
        const body = el(doc, 'rvx-paywall-feature-body');
        body.appendChild(textDiv('rvx-paywall-feature-title', f.title, theme.textPrimary));
        if (f.description) {
          body.appendChild(textDiv('rvx-paywall-feature-description', f.description, theme.textSecondary));
        }
        row.appendChild(body);
        wrap.appendChild(row);
      }
      return wrap;
    };

    // Compact single-line checks (hero banner body, plans checklist).
    const featureChecks = (): HTMLElement | null => {
      if (config.features.length === 0) return null;
      const wrap = el(doc, 'rvx-paywall-checks');
      for (const f of config.features) {
        const row = el(doc, 'rvx-paywall-check-row');
        row.appendChild(textDiv('rvx-paywall-check-icon', f.icon || '✓', accent));
        row.appendChild(textDiv('rvx-paywall-check-title', f.title, theme.textPrimary));
        wrap.appendChild(row);
      }
      return wrap;
    };

    // Trial timeline: icon dots joined by an accent rail; the first step is
    // filled solid ("you are here"), later steps are tinted.
    const timelineBlock = (): HTMLElement | null => {
      if (config.features.length === 0) return null;
      const wrap = el(doc, 'rvx-paywall-timeline');
      config.features.forEach((f, i) => {
        const last = i === config.features.length - 1;
        const row = el(doc, 'rvx-paywall-timeline-row');
        const rail = el(doc, 'rvx-paywall-timeline-rail');
        const dot = el(doc, 'rvx-paywall-timeline-dot');
        dot.style.backgroundColor = i === 0 ? accent : `${accent}26`;
        dot.appendChild(textDiv('rvx-paywall-timeline-dot-icon', f.icon || '✓', i === 0 ? theme.accentInk : accent));
        rail.appendChild(dot);
        if (!last) {
          const line = el(doc, 'rvx-paywall-timeline-line');
          line.style.backgroundColor = `${accent}40`;
          rail.appendChild(line);
        }
        row.appendChild(rail);
        const body = el(doc, `rvx-paywall-timeline-body${last ? '' : ' rvx-paywall-timeline-gap'}`);
        body.appendChild(textDiv('rvx-paywall-feature-title', f.title, theme.textPrimary));
        if (f.description) {
          body.appendChild(textDiv('rvx-paywall-feature-description', f.description, theme.textSecondary));
        }
        row.appendChild(body);
        wrap.appendChild(row);
      });
      return wrap;
    };

    // Feature grid: two-column soft cards with an accent icon tile each.
    const featureGrid = (): HTMLElement | null => {
      if (config.features.length === 0) return null;
      const wrap = el(doc, 'rvx-paywall-grid');
      for (const f of config.features) {
        const card = el(doc, 'rvx-paywall-grid-card');
        card.style.backgroundColor = cardBg;
        const tile = el(doc, 'rvx-paywall-grid-icon-tile');
        tile.style.backgroundColor = `${accent}26`;
        tile.appendChild(textDiv('rvx-paywall-grid-icon', f.icon || '✓', accent));
        card.appendChild(tile);
        card.appendChild(textDiv('rvx-paywall-grid-title', f.title, theme.textPrimary));
        if (f.description) {
          card.appendChild(textDiv('rvx-paywall-grid-description', f.description, theme.textSecondary));
        }
        wrap.appendChild(card);
      }
      return wrap;
    };

    // Reveal: onboarding-style numbered benefit cards + progress dots.
    const progressDots = (): HTMLElement => {
      const wrap = el(doc, 'rvx-paywall-dots');
      for (const i of [0, 1, 2]) {
        const dot = el(doc, 'rvx-paywall-dot');
        dot.style.backgroundColor = i === 0 ? accent : `${accent}40`;
        wrap.appendChild(dot);
      }
      return wrap;
    };
    const revealCards = (): HTMLElement | null => {
      if (config.features.length === 0) return null;
      const wrap = el(doc, 'rvx-paywall-reveal');
      config.features.forEach((f, i) => {
        const card = el(doc, 'rvx-paywall-reveal-card');
        card.style.backgroundColor = cardBg;
        const chip = el(doc, 'rvx-paywall-reveal-chip');
        chip.style.backgroundColor = `${accent}26`;
        chip.appendChild(textDiv('rvx-paywall-reveal-number', String(i + 1), accent));
        card.appendChild(chip);
        const body = el(doc, 'rvx-paywall-feature-body');
        body.appendChild(textDiv('rvx-paywall-reveal-title', f.title, theme.textPrimary));
        if (f.description) {
          body.appendChild(textDiv('rvx-paywall-feature-description', f.description, theme.textSecondary));
        }
        card.appendChild(body);
        wrap.appendChild(card);
      });
      return wrap;
    };

    // Social proof card: star row (+ numeric rating), quote, attribution.
    const review = config.review;
    const hasReviewCard = review !== undefined && (review.rating !== undefined || Boolean(review.quote));
    const reviewCard = (): HTMLElement | null => {
      if (!hasReviewCard || !review) return null;
      const card = el(doc, 'rvx-paywall-review-card');
      card.style.backgroundColor = cardBg;
      if (review.rating !== undefined) {
        const stars = el(doc, 'rvx-paywall-stars-row');
        for (const n of [1, 2, 3, 4, 5]) {
          stars.appendChild(
            textDiv('rvx-paywall-star', '★', n <= Math.round(review.rating ?? 0) ? accent : theme.border),
          );
        }
        stars.appendChild(textDiv('rvx-paywall-star-rating', String(review.rating), theme.textPrimary));
        card.appendChild(stars);
      }
      if (review.quote) {
        card.appendChild(textDiv('rvx-paywall-review-quote', `“${review.quote}”`, theme.textPrimary));
      }
      if (review.author) {
        card.appendChild(textDiv('rvx-paywall-review-author', `— ${review.author}`, theme.textSecondary));
      }
      return card;
    };
    const countLine = (): HTMLElement | null =>
      review?.count ? textDiv('rvx-paywall-count-line', review.count, theme.textSecondary) : null;

    // Offer bits: urgency line above the CTA; anchor price struck through on
    // the highlighted package.
    const urgencyLine = (): HTMLElement | null =>
      config.offer?.urgencyText ? textDiv('rvx-paywall-urgency', config.offer.urgencyText, accent) : null;
    // The anchor is dashboard free text while priceLabel is the store's
    // localized price — never pair them when their currency symbols disagree,
    // or a EUR customer would see a struck-through USD anchor next to the real
    // charge (this file's "display never disagrees with the charge" rule;
    // kept in lockstep with the preview's anchorPriceFor). Symbol-less
    // anchors can't be judged and pass through.
    const anchorPriceFor = (priceLabel: string): string | undefined => {
      const anchor = config.offer?.strikethroughPrice;
      if (!anchor) return undefined;
      const symbol = anchor.match(CURRENCY_SYMBOL)?.[0];
      return symbol === undefined || priceLabel.includes(symbol) ? anchor : undefined;
    };

    const priceLine = (pkg: RevnixPaywallPackage, highlighted: boolean): HTMLElement => {
      const anchorPrice = highlighted ? anchorPriceFor(pkg.priceLabel) : undefined;
      if (!anchorPrice) return textDiv('rvx-paywall-package-price', pkg.priceLabel, theme.textSecondary);
      const row = el(doc, 'rvx-paywall-price-row');
      row.appendChild(textDiv('rvx-paywall-anchor-price', anchorPrice, theme.textFaint));
      row.appendChild(textDiv('rvx-paywall-package-price', pkg.priceLabel, theme.textSecondary));
      return row;
    };

    // Standard package rows (all layouts except plans columns / offer
    // spotlight). `withBadge=false` suppresses the row badge where the layout
    // already presents the badge elsewhere (offer pill).
    const packageRows = (list: RevnixPaywallPackage[], withBadge = true): HTMLElement => {
      const wrap = el(doc, 'rvx-paywall-packages');
      for (const pkg of list) {
        const selected = pkg.packageId === selectedId;
        const highlighted = pkg.packageId === config.highlightPackageId;
        const badged = withBadge && highlighted && Boolean(config.badgeText);
        const row = radioButton('rvx-paywall-package-row', pkg.packageId, selected);
        row.style.borderWidth = selected ? '2px' : '1px';
        row.style.borderColor = selected ? accent : theme.border;
        if (badged) {
          const badge = el(doc, 'rvx-paywall-badge');
          badge.style.backgroundColor = accent;
          badge.appendChild(textDiv('rvx-paywall-badge-text', config.badgeText ?? '', theme.accentInk));
          row.appendChild(badge);
        }
        row.appendChild(textDiv('rvx-paywall-package-title', pkg.title, theme.textPrimary));
        row.appendChild(priceLine(pkg, highlighted));
        wrap.appendChild(row);
      }
      return wrap;
    };

    // Plans layout: packages side by side as tier columns; the highlighted
    // tier carries the badge pill inside the column. Columns stay readable up
    // to 3 — beyond that the layout falls back to stacked rows (never drop a
    // purchasable package), same rule as the dashboard preview.
    const usePlanColumns = shown.length <= 3;
    const planColumns = (): HTMLElement => {
      const wrap = el(doc, 'rvx-paywall-plan-row');
      for (const pkg of shown) {
        const selected = pkg.packageId === selectedId;
        const highlighted = pkg.packageId === config.highlightPackageId;
        const anchorPrice = highlighted ? anchorPriceFor(pkg.priceLabel) : undefined;
        const column = radioButton('rvx-paywall-plan-column', pkg.packageId, selected);
        column.style.borderWidth = selected ? '2px' : '1px';
        column.style.borderColor = selected ? accent : theme.border;
        if (highlighted && config.badgeText) {
          const badge = el(doc, 'rvx-paywall-plan-badge');
          badge.style.backgroundColor = accent;
          badge.appendChild(textDiv('rvx-paywall-badge-text', config.badgeText, theme.accentInk));
          column.appendChild(badge);
        }
        column.appendChild(textDiv('rvx-paywall-plan-title', pkg.title, theme.textPrimary));
        if (anchorPrice) {
          column.appendChild(textDiv('rvx-paywall-anchor-price', anchorPrice, theme.textFaint));
        }
        column.appendChild(textDiv('rvx-paywall-plan-price', pkg.priceLabel, theme.textPrimary));
        wrap.appendChild(column);
      }
      return wrap;
    };

    // Offer layout: the badge becomes a large centered pill; the highlighted
    // (else first) package renders as a spotlight card with the anchor price.
    const spotlightPkg: RevnixPaywallPackage | undefined =
      shown.find((p) => p.packageId === config.highlightPackageId) ?? shown[0];
    const offerPill = (): HTMLElement | null => {
      if (!config.badgeText) return null;
      const pill = el(doc, 'rvx-paywall-offer-pill');
      pill.style.backgroundColor = accent;
      pill.appendChild(textDiv('rvx-paywall-offer-pill-text', config.badgeText, theme.accentInk));
      return pill;
    };
    const offerSpotlight = (): HTMLElement[] => {
      if (!spotlightPkg) return [];
      const spotlightAnchor = anchorPriceFor(spotlightPkg.priceLabel);
      const spot = radioButton('rvx-paywall-spotlight', spotlightPkg.packageId, spotlightPkg.packageId === selectedId);
      spot.style.borderColor = spotlightPkg.packageId === selectedId ? accent : theme.border;
      spot.appendChild(textDiv('rvx-paywall-spotlight-title', spotlightPkg.title, theme.textPrimary));
      const priceRow = el(doc, 'rvx-paywall-price-row-center');
      if (spotlightAnchor) {
        priceRow.appendChild(textDiv('rvx-paywall-spotlight-anchor', spotlightAnchor, theme.textFaint));
      }
      priceRow.appendChild(textDiv('rvx-paywall-spotlight-price', spotlightPkg.priceLabel, theme.textPrimary));
      spot.appendChild(priceRow);
      const nodes: HTMLElement[] = [spot];
      if (shown.length > 1) {
        nodes.push(
          packageRows(
            shown.filter((p) => p.packageId !== spotlightPkg.packageId),
            false,
          ),
        );
      }
      return nodes;
    };

    const cta = (): HTMLElement => {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'rvx-paywall-cta';
      button.setAttribute('data-rvx-key', 'cta');
      button.style.backgroundColor = accent;
      button.disabled = Boolean(loading) || !selectedId;
      button.addEventListener('click', () => {
        if (!this.options.loading && selectedId) this.options.onPurchase(selectedId);
      });
      if (loading) {
        const spinner = el(doc, 'rvx-paywall-spinner');
        spinner.style.borderColor = theme.accentInk;
        spinner.style.borderTopColor = 'transparent';
        button.appendChild(spinner);
      } else {
        button.appendChild(textDiv('rvx-paywall-cta-label', config.ctaLabel, theme.accentInk));
      }
      return button;
    };

    const footerBlock = (): HTMLElement | null => {
      if (footerItems.length === 0) return null;
      const wrap = el(doc, 'rvx-paywall-footer');
      footerItems.forEach((item, i) => {
        if (i > 0) wrap.appendChild(textDiv('rvx-paywall-footer-dot', ' · ', theme.textFaint));
        let link: HTMLElement;
        if (item.onPress) {
          const button = doc.createElement('button');
          button.type = 'button';
          const onPress = item.onPress;
          button.addEventListener('click', () => onPress());
          link = button;
        } else if (item.url) {
          const anchor = doc.createElement('a');
          anchor.href = item.url;
          anchor.target = '_blank';
          anchor.rel = 'noopener noreferrer';
          link = anchor;
        } else {
          link = doc.createElement('span');
        }
        link.className = 'rvx-paywall-footer-link';
        link.setAttribute('data-rvx-key', `footer:${item.label}`);
        link.style.color = theme.textFaint;
        link.textContent = item.label;
        wrap.appendChild(link);
      });
      return wrap;
    };

    // Tail shared by every layout: urgency → CTA → count → footer.
    const tail = (): (HTMLElement | null)[] => [urgencyLine(), cta(), countLine(), footerBlock()];

    const children: (HTMLElement | null)[] = [];
    switch (layout) {
      case 'hero':
        children.push(heroBanner(), featureChecks(), reviewCard(), packageRows(shown), ...tail());
        break;
      case 'timeline':
        children.push(heroOrIcon(), ...headlineBlock(), timelineBlock(), reviewCard(), packageRows(shown), ...tail());
        break;
      case 'plans':
        children.push(
          heroOrIcon(),
          ...headlineBlock(),
          usePlanColumns ? planColumns() : packageRows(shown),
          featureChecks(),
          reviewCard(),
          ...tail(),
        );
        break;
      case 'feature-grid':
        children.push(heroOrIcon(), ...headlineBlock(), featureGrid(), reviewCard(), packageRows(shown), ...tail());
        break;
      case 'offer':
        children.push(heroOrIcon(), offerPill(), ...headlineBlock(), ...offerSpotlight(), reviewCard(), ...tail());
        break;
      case 'reveal':
        children.push(progressDots(), heroOrIcon(), ...headlineBlock(), revealCards(), packageRows(shown), ...tail());
        break;
      default:
        // focus | feature-list | minimal — the original structure, unchanged
        // for legacy configs (review/offer blocks only exist when configured).
        children.push(
          heroOrIcon(),
          ...headlineBlock(),
          layout === 'feature-list' ? featureBullets() : null,
          reviewCard(),
          packageRows(shown),
          ...tail(),
        );
        break;
    }

    // Swap only the content column — the root/scroll nodes persist, so the
    // scroll position survives a re-render (selection taps, loading state).
    // Focus survives too: the focused element's data-rvx-key is re-focused
    // after the swap so keyboard users don't lose their place.
    const active = doc.activeElement;
    const focusKey =
      active instanceof HTMLElement && this.root.contains(active) ? active.getAttribute('data-rvx-key') : null;

    this.root.style.backgroundColor = theme.background;
    const next = el(doc, 'rvx-paywall-content');
    for (const child of children) {
      if (child) next.appendChild(child);
    }
    if (this.content) {
      this.content.replaceWith(next);
    } else {
      this.scrollContent.appendChild(next);
    }
    this.content = next;

    if (focusKey !== null) {
      for (const candidate of Array.from(next.querySelectorAll<HTMLElement>('[data-rvx-key]'))) {
        if (candidate.getAttribute('data-rvx-key') === focusKey) {
          candidate.focus({ preventScroll: true });
          break;
        }
      }
    }
  }
}

function el(doc: Document, className: string): HTMLDivElement {
  const node = doc.createElement('div');
  node.className = className;
  return node;
}

/** Inject the scoped stylesheet once per document (all instances share it). */
function ensureStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = PAYWALL_CSS;
  doc.head.appendChild(style);
}

// PROPORTIONS mirror RevnixPaywall.tsx / PaywallPhonePreview.tsx — the RN
// stylesheet's dp values carried over 1:1 as CSS px (RN dp ≈ CSS px), colors
// applied inline per render exactly where the RN renderer applies them.
//
// Responsive rules (same intent as the RN ScrollView):
//  · scroll-content min-height 100% + content margin auto — content sits
//    vertically centered on tall screens (no dead bottom half) and scrolls
//    normally when it overflows (auto margins collapse to 0, so nothing
//    clips at the top the way justify-content: center would).
//  · content max-width — on tablets/wide screens the column stays a readable
//    width, horizontally centered, instead of stretching edge to edge.
//  · the safe-area max() padding is the DOM translation of the RN
//    ScrollView's contentInsetAdjustmentBehavior="automatic".
const PAYWALL_CSS = `
.rvx-paywall-root, .rvx-paywall-root * { margin: 0; padding: 0; box-sizing: border-box; }
.rvx-paywall-root button {
  background: none;
  color: inherit;
  font: inherit;
  border-width: 0;
  border-style: solid;
  text-align: inherit;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  -webkit-tap-highlight-color: transparent;
}
.rvx-paywall-root {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}
.rvx-paywall-scroll {
  flex: 1 1 0%;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.rvx-paywall-scroll::-webkit-scrollbar { display: none; }
.rvx-paywall-scroll-content {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  padding: 28px 24px 32px;
  padding: max(28px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-right))
    max(32px, env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left));
}
.rvx-paywall-content {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 440px;
  margin: auto;
}
.rvx-paywall-hero-image {
  display: block;
  width: 100%;
  height: 180px;
  border-radius: 16px;
  margin: 8px 0 22px;
  object-fit: cover;
}
.rvx-paywall-icon-tile {
  align-self: center;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 16px;
  margin: 8px 0 22px;
}
.rvx-paywall-icon-glyph { font-size: 27px; }
.rvx-paywall-headline {
  font-size: 26px;
  font-weight: 800;
  text-align: center;
  margin-bottom: 10px;
}
.rvx-paywall-subheadline {
  font-size: 15px;
  line-height: 21px;
  text-align: center;
  margin-bottom: 26px;
}
/* hero layout banner */
.rvx-paywall-hero-banner {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  min-height: 260px;
  border-radius: 20px;
  overflow: hidden;
  margin: 8px 0 22px;
}
.rvx-paywall-hero-banner-fill {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.rvx-paywall-hero-banner-glyph-wrap {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-bottom: 72px;
  pointer-events: none;
}
.rvx-paywall-hero-banner-glyph { font-size: 64px; color: rgba(255, 255, 255, 0.35); }
.rvx-paywall-hero-banner-scrim {
  position: relative;
  background-color: rgba(0, 0, 0, 0.45);
  padding: 16px 18px;
}
.rvx-paywall-hero-banner-headline { font-size: 24px; font-weight: 800; color: #ffffff; }
.rvx-paywall-hero-banner-sub {
  font-size: 13.5px;
  line-height: 19px;
  color: rgba(255, 255, 255, 0.85);
  margin-top: 4px;
}
.rvx-paywall-features { display: flex; flex-direction: column; gap: 14px; margin-bottom: 26px; }
.rvx-paywall-feature-row { display: flex; align-items: flex-start; gap: 12px; }
.rvx-paywall-feature-icon { flex-shrink: 0; width: 24px; font-size: 15px; line-height: 21px; }
.rvx-paywall-feature-body { flex: 1 1 0%; min-width: 0; }
.rvx-paywall-feature-title { font-size: 15.5px; font-weight: 600; line-height: 21px; }
.rvx-paywall-feature-description { font-size: 13px; line-height: 18px; margin-top: 1px; }
/* compact single-line checks */
.rvx-paywall-checks { display: flex; flex-direction: column; gap: 10px; margin-bottom: 24px; }
.rvx-paywall-check-row { display: flex; align-items: center; gap: 10px; }
.rvx-paywall-check-icon { flex-shrink: 0; width: 20px; font-size: 14px; }
.rvx-paywall-check-title { flex: 1 1 0%; font-size: 14.5px; font-weight: 500; line-height: 20px; }
/* trial timeline */
.rvx-paywall-timeline { display: flex; flex-direction: column; margin-bottom: 26px; }
.rvx-paywall-timeline-row { display: flex; gap: 12px; }
.rvx-paywall-timeline-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  width: 34px;
}
.rvx-paywall-timeline-dot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 17px;
}
.rvx-paywall-timeline-dot-icon { font-size: 14px; }
.rvx-paywall-timeline-line { flex: 1 1 0%; width: 2px; margin: 4px 0; }
.rvx-paywall-timeline-body { flex: 1 1 0%; min-width: 0; padding-top: 6px; }
.rvx-paywall-timeline-gap { padding-bottom: 22px; }
/* feature grid */
.rvx-paywall-grid { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 24px; }
.rvx-paywall-grid-card { width: 47.5%; flex-grow: 1; border-radius: 14px; padding: 13px; }
.rvx-paywall-grid-icon-tile {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  margin-bottom: 9px;
}
.rvx-paywall-grid-icon { font-size: 15px; }
.rvx-paywall-grid-title { font-size: 13.5px; font-weight: 600; line-height: 18px; }
.rvx-paywall-grid-description { font-size: 12px; line-height: 16px; margin-top: 3px; }
/* reveal (onboarding-style) */
.rvx-paywall-dots { display: flex; justify-content: center; gap: 6px; margin-bottom: 18px; }
.rvx-paywall-dot { width: 6px; height: 6px; border-radius: 3px; }
.rvx-paywall-reveal { display: flex; flex-direction: column; gap: 10px; margin-bottom: 24px; }
.rvx-paywall-reveal-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  border-radius: 14px;
  padding: 14px;
}
.rvx-paywall-reveal-chip {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border-radius: 13px;
}
.rvx-paywall-reveal-number { font-size: 13px; font-weight: 700; }
.rvx-paywall-reveal-title { font-size: 15px; font-weight: 600; line-height: 20px; }
/* social proof */
.rvx-paywall-review-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  border-radius: 14px;
  padding: 14px;
  margin-bottom: 22px;
}
.rvx-paywall-stars-row { display: flex; align-items: center; }
.rvx-paywall-star { font-size: 15px; margin: 0 1px; }
.rvx-paywall-star-rating { font-size: 13px; font-weight: 600; margin-left: 6px; }
.rvx-paywall-review-quote {
  font-size: 13.5px;
  line-height: 19px;
  font-style: italic;
  text-align: center;
  margin-top: 8px;
}
.rvx-paywall-review-author { font-size: 12px; margin-top: 6px; }
.rvx-paywall-count-line { font-size: 12.5px; text-align: center; margin-bottom: 14px; }
/* offer */
.rvx-paywall-urgency { font-size: 13px; font-weight: 600; text-align: center; margin-bottom: 10px; }
.rvx-paywall-offer-pill {
  align-self: center;
  max-width: 80%;
  border-radius: 20px;
  padding: 5px 12px;
  margin-bottom: 14px;
}
.rvx-paywall-offer-pill-text {
  font-size: 12px;
  font-weight: 700;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.rvx-paywall-spotlight {
  display: flex;
  flex-direction: column;
  align-items: center;
  border-width: 2px;
  border-style: solid;
  border-radius: 16px;
  padding: 18px;
  margin-bottom: 12px;
}
.rvx-paywall-spotlight-title { font-size: 16px; font-weight: 600; }
.rvx-paywall-price-row-center {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 8px;
  margin-top: 6px;
}
.rvx-paywall-spotlight-anchor {
  font-size: 15px;
  text-decoration: line-through;
  font-variant-numeric: tabular-nums;
}
.rvx-paywall-spotlight-price { font-size: 24px; font-weight: 800; font-variant-numeric: tabular-nums; }
/* plans columns */
.rvx-paywall-plan-row { display: flex; align-items: stretch; gap: 8px; margin-bottom: 22px; }
.rvx-paywall-plan-column {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1 1 0%;
  min-width: 0;
  border-style: solid;
  border-radius: 14px;
  padding: 14px 8px;
}
.rvx-paywall-plan-badge { max-width: 100%; border-radius: 20px; padding: 2px 8px; margin-bottom: 7px; }
.rvx-paywall-plan-title { font-size: 14px; font-weight: 600; text-align: center; line-height: 19px; }
.rvx-paywall-plan-price {
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  margin-top: 4px;
}
.rvx-paywall-packages { display: flex; flex-direction: column; gap: 12px; margin-bottom: 22px; }
.rvx-paywall-package-row {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  border-style: solid;
  border-radius: 12px;
  padding: 15px 16px;
  text-align: left;
}
.rvx-paywall-badge {
  position: absolute;
  top: -11px;
  right: 14px;
  border-radius: 20px;
  padding: 3px 10px;
  /* Absolutely positioned nodes take no width constraint from the card — a
     long badge string used to grow past the card edge (kept in lockstep with
     the dashboard preview, which truncates the same way). */
  max-width: 80%;
}
.rvx-paywall-badge-text {
  font-size: 11px;
  font-weight: 700;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.rvx-paywall-package-title { font-size: 16px; font-weight: 600; }
.rvx-paywall-package-price { font-size: 14px; font-variant-numeric: tabular-nums; margin-top: 2px; }
.rvx-paywall-price-row { display: flex; align-items: baseline; gap: 6px; margin-top: 2px; }
.rvx-paywall-anchor-price {
  font-size: 13px;
  text-decoration: line-through;
  font-variant-numeric: tabular-nums;
}
.rvx-paywall-cta {
  display: flex;
  flex-direction: column;
  align-items: center;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 14px;
}
.rvx-paywall-cta:disabled { cursor: default; }
.rvx-paywall-cta-label { font-size: 16.5px; font-weight: 700; }
.rvx-paywall-spinner {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border-width: 2px;
  border-style: solid;
  animation: rvx-paywall-spin 0.8s linear infinite;
}
@keyframes rvx-paywall-spin { to { transform: rotate(360deg); } }
.rvx-paywall-footer { display: flex; justify-content: center; }
.rvx-paywall-footer-link { font-size: 13px; padding: 4px; text-decoration: none; cursor: pointer; }
span.rvx-paywall-footer-link { cursor: default; }
.rvx-paywall-footer-dot { font-size: 13px; padding: 4px 0; white-space: pre; }
`;
