// Render contract v2 (REV-262): selection, root tags, canvas, buttons, images.
//
// Runs against the COMPILED output (dist/esm) with jsdom, like the other
// suites — the published artifact is what an app actually loads.
//
// `paywall-selection-wire.json` is a byte-identical copy of the fixture every
// Revnix renderer walks (revnix-app/tests/fixtures). Each case names a host
// selection and a config highlight, and lists the effective style, the
// presence and the resolved text it expects of named blocks. It is walked
// here through the PUBLIC entry point, `renderRevnixPaywall`, so the host's
// selection rule (selectedPackageId → highlight → first) is exercised as an
// app exercises it, not a re-implementation of it.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { beforeEach, describe, test } from 'node:test';
import { JSDOM } from 'jsdom';

const {
  renderBlockDoc,
  resolveSelectedContext,
  effectiveStyle,
  isVisible,
  hasCloseAction,
  canvasMetrics,
  toRgb,
  CANVAS_MAX_WIDTH,
  DESIGN_CANVAS,
} = await import('../dist/esm/blocks.js');
// The host entry point comes from the rollup bundle: dist/esm/ui.js imports
// './blocks' without an extension, which node's ESM loader cannot follow, and
// the bundle is the artifact a Capacitor app actually loads anyway.
const { renderRevnixPaywall } = createRequire(import.meta.url)('../dist/plugin.cjs.js');

const wire = JSON.parse(readFileSync(new URL('./paywall-selection-wire.json', import.meta.url), 'utf8'));

let document;
let window;
beforeEach(() => {
  window = new JSDOM('<!doctype html><html><head></head><body></body></html>').window;
  document = window.document;
});

/** The colour as the CSSOM serialises it, so `#222222` and `@accent` compare
 *  with what jsdom stored. */
const cssColor = (value, doc) => {
  const raw = value === '@accent' ? doc.accent : value;
  const rgb = toRgb(raw);
  return rgb ? `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` : raw;
};

const byId = (root, id) => root.querySelector(`[data-block-id="${id}"]`);

const click = (node) => node.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

describe('the selection wire contract', () => {
  for (const c of wire.cases) {
    test(c.name, () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      renderRevnixPaywall(container, {
        config: {
          blocks: wire.doc,
          ...(c.highlight === null ? {} : { highlightPackageId: c.highlight }),
        },
        packages: wire.packages,
        ...(c.selected === null ? {} : { selectedPackageId: c.selected }),
        onPurchase: () => {},
      });

      for (const [id, expected] of Object.entries(c.styles)) {
        const node = byId(container, id);
        assert.ok(node, `${id} should render`);
        if (expected.fill !== undefined) {
          assert.equal(node.style.backgroundColor, cssColor(expected.fill, wire.doc), `${id} fill`);
        }
        if (expected.borderColor !== undefined) {
          assert.equal(node.style.borderColor, cssColor(expected.borderColor, wire.doc), `${id} borderColor`);
        }
        if (expected.borderWidth !== undefined) {
          assert.equal(node.style.borderWidth, `${expected.borderWidth}px`, `${id} borderWidth`);
        }
      }
      for (const id of c.visible) assert.ok(byId(container, id), `${id} should be drawn`);
      for (const id of c.hidden) assert.equal(byId(container, id), null, `${id} should not be drawn`);
      for (const [id, text] of Object.entries(c.texts)) {
        assert.equal(byId(container, id)?.textContent, text, `${id} text`);
      }
    });
  }

  test('a tap moves the selected context, and the descendants follow it', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    renderRevnixPaywall(container, {
      config: { blocks: wire.doc },
      packages: wire.packages,
      onPurchase: () => {},
    });
    assert.ok(byId(container, 'c0-dot'));
    assert.equal(byId(container, 'c1-dot'), null);
    click(byId(container, 'c1'));
    assert.equal(byId(container, 'c0-dot'), null, 'the monthly dot leaves with the selection');
    assert.ok(byId(container, 'c1-dot'), 'the yearly dot arrives with it');
    assert.equal(byId(container, 'c1-ring').style.borderColor, cssColor('@accent', wire.doc));
    assert.equal(byId(container, 'footer').textContent, '7 days free, then $59.99/yr. Cancel anytime.');
  });
});

const DOC = {
  version: 1,
  layout: 'flow',
  background: '#101014',
  textColor: '#F5F7FA',
  accent: '#6478ff',
  accentInk: '#0B0D10',
  blocks: [],
};

const PKGS = [
  { packageId: 'annual', title: 'Annual', priceLabel: '$59.99', period: 'annual', amountMinor: 5999, currency: 'USD' },
  { packageId: 'monthly', title: 'Monthly', priceLabel: '$9.99', period: 'monthly', amountMinor: 999, currency: 'USD' },
];

const render = (blocks, extra = {}) =>
  renderBlockDoc({ doc: { ...DOC, blocks }, packages: PKGS, ...extra }, document);

describe('the pure selected-context helpers', () => {
  const ctx = { doc: DOC, packages: PKGS, highlightPackageId: 'monthly' };
  const root = { pkg: PKGS[1], selected: false, inPackageCard: false };

  test('a pinned card opens the scope for its package; anything else inherits', () => {
    const pinned = { id: 'c', type: 'card', packageIndex: 1, children: [] };
    assert.deepEqual(resolveSelectedContext(pinned, ctx, root), {
      pkg: PKGS[1],
      selected: true,
      inPackageCard: true,
    });
    const other = { id: 'c', type: 'card', packageIndex: 0, children: [] };
    assert.equal(resolveSelectedContext(other, ctx, root).selected, false);
    const plain = { id: 'c', type: 'card', children: [] };
    assert.equal(resolveSelectedContext(plain, ctx, root), root);
    const text = { id: 't', type: 'text', text: 'x' };
    assert.equal(resolveSelectedContext(text, ctx, root), root);
  });

  test('a pinned card the offering does not reach inherits rather than throws', () => {
    const missing = { id: 'c', type: 'card', packageIndex: 9, children: [] };
    assert.equal(resolveSelectedContext(missing, ctx, root), root);
  });

  test('selectedStyle merges over style field by field, only in selected context', () => {
    const block = { id: 't', type: 'text', text: 'x', style: { radius: 4, fill: '#111' }, selectedStyle: { fill: '#222' } };
    assert.deepEqual(effectiveStyle(block, { selected: true, inPackageCard: true }), { radius: 4, fill: '#222' });
    assert.deepEqual(effectiveStyle(block, { selected: false, inPackageCard: true }), { radius: 4, fill: '#111' });
    // Root-level: never selected, so never merged.
    assert.deepEqual(effectiveStyle(block, root), { radius: 4, fill: '#111' });
  });

  test('visibility answers to the scope, and is ignored at the root', () => {
    const on = { id: 'a', type: 'text', text: 'x', visibility: 'selected' };
    const off = { id: 'b', type: 'text', text: 'x', visibility: 'unselected' };
    const always = { id: 'c', type: 'text', text: 'x' };
    const sel = { selected: true, inPackageCard: true };
    const unsel = { selected: false, inPackageCard: true };
    assert.equal(isVisible(on, sel), true);
    assert.equal(isVisible(on, unsel), false);
    assert.equal(isVisible(off, sel), false);
    assert.equal(isVisible(off, unsel), true);
    assert.equal(isVisible(always, sel), true);
    assert.equal(isVisible(always, unsel), true);
    assert.equal(isVisible(on, root), true, 'a root block is never hidden');
    assert.equal(isVisible(off, root), true);
    // A visibility value from a newer dashboard draws rather than hides.
    assert.equal(isVisible({ ...on, visibility: 'hover' }, unsel), true);
  });

  test('a close with visibility set does not suppress the fallback chip', () => {
    const close = { id: 'x', type: 'text', text: '×', action: 'close' };
    assert.equal(hasCloseAction([close]), true);
    assert.equal(hasCloseAction([{ ...close, visibility: 'selected' }]), false);
    assert.equal(hasCloseAction([{ id: 'c', type: 'card', visibility: 'unselected', children: [close] }]), false);
  });

  test('a package card is judged in the scope it opens, so it can hide itself when unselected', () => {
    const pinned = (index) => ({
      id: `c${index}`,
      type: 'card',
      packageIndex: index,
      visibility: 'selected',
      children: [{ id: `t${index}`, type: 'text', text: '{title}' }],
    });
    const screen = render([pinned(0), pinned(1)], { highlightPackageId: 'monthly' });
    assert.equal(byId(screen, 'c0'), null);
    assert.ok(byId(screen, 'c1'));
    // A repeat card with visibility renders only the instances that match.
    const repeated = render(
      [{ id: 'r', type: 'card', repeat: 'packages', visibility: 'unselected', children: [{ id: 't', type: 'text', text: '{title}' }] }],
      { highlightPackageId: 'monthly' },
    );
    assert.equal(repeated.textContent, 'Annual');
  });

  test('selectedStyle reaches a descendant of a repeat instance, not the others', () => {
    const screen = render(
      [
        {
          id: 'c',
          type: 'card',
          repeat: 'packages',
          children: [{ id: 'k', type: 'text', text: '{title}', style: { radius: 2 }, selectedStyle: { radius: 30 } }],
        },
      ],
      { highlightPackageId: 'monthly' },
    );
    const [annual, monthly] = screen.firstChild.firstChild.childNodes;
    assert.equal(annual.firstChild.style.borderRadius, '2px');
    assert.equal(monthly.firstChild.style.borderRadius, '30px');
  });
});

describe('tags outside a package card', () => {
  test('resolve against the selected package, so the renewal line shows the price the CTA buys', () => {
    const line = { id: 'f', type: 'text', text: '7 days free, then {price}/{period_short}' };
    assert.equal(render([line]).textContent, '7 days free, then $59.99/yr');
    assert.equal(render([line], { highlightPackageId: 'monthly' }).textContent, '7 days free, then $9.99/mo');
  });

  test('a plain card passes the selected package down unchanged', () => {
    const screen = render([{ id: 'c', type: 'card', children: [{ id: 't', type: 'text', text: '{title}' }] }], {
      highlightPackageId: 'monthly',
    });
    assert.equal(screen.textContent, 'Monthly');
  });

  test('a highlight the offering does not carry falls back to the first package', () => {
    assert.equal(render([{ id: 't', type: 'text', text: '{title}' }], { highlightPackageId: 'gone' }).textContent, 'Annual');
  });

  test('with no packages at all a tag stays visible rather than guessing', () => {
    const screen = renderBlockDoc(
      { doc: { ...DOC, blocks: [{ id: 't', type: 'text', text: '{price}' }] }, packages: [] },
      document,
    );
    assert.equal(screen.textContent, '{price}');
  });
});

describe('buttons', () => {
  test('the pressed state is a stylesheet rule on :active, not a hover', () => {
    render([{ id: 'b', type: 'button', label: 'Go' }]);
    const sheet = document.getElementById('rvx-block-styles');
    assert.ok(sheet, 'the renderer injects its stylesheet');
    assert.match(sheet.textContent, /\.rvx-block-button:active\s*\{\s*opacity:\s*0?\.8;?\s*\}/);
    assert.doesNotMatch(sheet.textContent, /:hover/);
    const button = document.body.appendChild(render([{ id: 'b', type: 'button', label: 'Go' }])).querySelector('button');
    assert.ok(button.classList.contains('rvx-block-button'));
  });

  test('the stylesheet is injected once per document', () => {
    render([{ id: 'b', type: 'button', label: 'Go' }]);
    render([{ id: 'b', type: 'button', label: 'Go' }]);
    assert.equal(document.querySelectorAll('#rvx-block-styles').length, 1);
  });

  test('a selection target gets no pressed feedback; its selectedStyle is the feedback', () => {
    const screen = render([{ id: 'c', type: 'card', packageIndex: 0, children: [] }], { onSelect: () => {} });
    assert.equal(screen.firstChild.firstChild.classList.contains('rvx-block-button'), false);
  });

  test('loading disables the purchase button, hides its label and spins in accentInk', () => {
    const bought = [];
    const screen = render([{ id: 'b', type: 'button', label: 'Continue' }], {
      loading: true,
      onPurchase: (id) => bought.push(id),
    });
    const button = screen.querySelector('button');
    assert.equal(button.disabled, true);
    assert.equal(button.getAttribute('aria-disabled'), 'true');
    // The label is still there — hidden, so the button keeps its size.
    const label = button.querySelector('span');
    assert.equal(label.textContent, 'Continue');
    assert.equal(label.style.visibility, 'hidden');
    const spinner = button.querySelector('.rvx-block-spinner');
    assert.ok(spinner, 'a spinner replaces the label visually');
    assert.equal(spinner.style.borderLeftColor, cssColor(DOC.accentInk, DOC));
    assert.equal(spinner.style.borderBottomColor, cssColor(DOC.accentInk, DOC));
    assert.equal(spinner.style.borderTopColor, 'transparent');
    assert.equal(spinner.style.position, 'absolute');
    // The fill is kept, and a synthetic click still buys nothing.
    assert.equal(button.style.background, cssColor(DOC.accent, DOC));
    click(button);
    assert.deepEqual(bought, []);
  });

  test('loading leaves a close-action button alone', () => {
    let closed = 0;
    const screen = render([{ id: 'b', type: 'button', label: 'Not now', action: 'close' }], {
      loading: true,
      onClose: () => (closed += 1),
    });
    const button = screen.querySelector('button');
    assert.equal(button.disabled, false);
    assert.equal(button.textContent, 'Not now');
    assert.equal(button.querySelector('.rvx-block-spinner'), null);
    click(button);
    assert.equal(closed, 1);
  });

  test('the host passes loading through update(), and the CTA reflects it', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const bought = [];
    const handle = renderRevnixPaywall(container, {
      config: { blocks: { ...DOC, blocks: [{ id: 'b', type: 'button', label: 'Go' }] } },
      packages: PKGS,
      onPurchase: (id) => bought.push(id),
    });
    const before = container.querySelector('button.rvx-block-button');
    assert.equal(before.disabled, false);
    click(before);
    assert.deepEqual(bought, ['annual']);

    handle.update({ loading: true });
    const during = container.querySelector('button.rvx-block-button');
    assert.equal(during.disabled, true);
    assert.ok(during.querySelector('.rvx-block-spinner'));
    click(during);
    assert.deepEqual(bought, ['annual'], 'no second charge while loading');

    handle.update({ loading: false });
    const after = container.querySelector('button.rvx-block-button');
    assert.equal(after.disabled, false);
    assert.equal(after.textContent, 'Go');
  });
});

describe('canvas layout', () => {
  test('scales by width, capped at 480, and centres what it cannot grow into', () => {
    assert.equal(canvasMetrics(393, 852).scale, 1);
    assert.equal(canvasMetrics(393, 852).left, 0);
    const wide = canvasMetrics(1024, 852);
    assert.equal(wide.scale, CANVAS_MAX_WIDTH / DESIGN_CANVAS.width);
    assert.ok(Math.abs(wide.left - (1024 - 480) / 2) < 0.001);
  });

  test('a taller viewport extends the design height in design units; a shorter one scrolls', () => {
    const tall = canvasMetrics(393, 1000);
    assert.equal(tall.designHeight, 1000);
    assert.equal(tall.height, 1000);
    assert.equal(tall.overflows, false);

    const scaled = canvasMetrics(786, 2000); // scale 1.2213 (capped at 480)
    assert.ok(Math.abs(scaled.designHeight - 2000 / scaled.scale) < 0.001);
    assert.ok(Math.abs(scaled.height - 2000) < 0.001);

    const short = canvasMetrics(393, 600);
    assert.equal(short.designHeight, 852);
    assert.equal(short.height, 852);
    assert.equal(short.overflows, true);

    // Not laid out yet: stay at the authored size.
    assert.equal(canvasMetrics(393, 0).designHeight, 852);
  });

  /** A box jsdom cannot lay out, given the size a real WebView would report. */
  const viewportOf = (width, height) => {
    const node = document.createElement('div');
    Object.defineProperty(node, 'clientWidth', { value: width, configurable: true });
    Object.defineProperty(node, 'clientHeight', { value: height, configurable: true });
    return node;
  };

  const canvasDoc = {
    ...DOC,
    layout: 'canvas',
    blocks: [{ id: 'root', type: 'card', layout: 'stack', style: { height: '100%' }, children: [] }],
  };

  test('the screen fills a taller viewport and switches scrolling off', () => {
    const viewport = viewportOf(393, 1000);
    const screen = renderBlockDoc({ doc: canvasDoc, packages: PKGS, viewport }, document);
    const body = screen.firstChild;
    assert.equal(screen.style.height, '1000px');
    assert.equal(body.style.height, '1000px');
    assert.equal(body.style.transform, 'scale(1)');
    assert.equal(body.style.left, '0px');
    assert.equal(viewport.style.overflowY, 'hidden');
    assert.equal(viewport.style.overscrollBehavior, 'none');
  });

  test('a shorter viewport keeps the authored height and scrolls', () => {
    const viewport = viewportOf(393, 600);
    const screen = renderBlockDoc({ doc: canvasDoc, packages: PKGS, viewport }, document);
    assert.equal(screen.style.height, '852px');
    assert.equal(screen.firstChild.style.height, '852px');
    assert.equal(viewport.style.overflowY, 'auto');
    assert.equal(viewport.style.overscrollBehavior, '');
  });

  test('a wide viewport centres the scaled design and the background spans the viewport', () => {
    const scale = 480 / 393;
    // Taller than the capped design: the screen fills the viewport.
    const tall = viewportOf(1024, 1200);
    const filled = renderBlockDoc({ doc: canvasDoc, packages: PKGS, viewport: tall }, document);
    const body = filled.firstChild;
    assert.equal(body.style.transform, `scale(${scale})`);
    assert.equal(parseFloat(body.style.left).toFixed(2), ((1024 - 480) / 2).toFixed(2));
    assert.equal(filled.style.width, '100%');
    assert.equal(filled.style.height, '1200px');
    assert.equal(parseFloat(body.style.height).toFixed(2), (1200 / scale).toFixed(2));
    // Shorter than the capped design (852 × 1.22 ≈ 1041): it scrolls instead.
    const short = viewportOf(1024, 900);
    const scrolled = renderBlockDoc({ doc: canvasDoc, packages: PKGS, viewport: short }, document);
    assert.equal(parseFloat(scrolled.style.height).toFixed(2), (852 * scale).toFixed(2));
    assert.equal(short.style.overflowY, 'auto');
  });

  test('the close chip clears the safe area in unscaled points, outside the transform', () => {
    const viewport = viewportOf(393, 852);
    const screen = renderBlockDoc({ doc: canvasDoc, packages: PKGS, viewport, onClose: () => {} }, document);
    const chip = screen.querySelector('button[aria-label="Close"]');
    assert.equal(chip.parentNode, screen, 'outside the scaled body');
    assert.equal(chip.style.top, 'calc(14px + env(safe-area-inset-top))');
    assert.equal(chip.style.right, '14px');
  });

  test('the host strips its padding around a canvas design and restores it for a column', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const handle = renderRevnixPaywall(container, {
      config: { blocks: canvasDoc },
      packages: PKGS,
      onPurchase: () => {},
    });
    const content = container.querySelector('.rvx-paywall-scroll-content');
    assert.ok(content.classList.contains('rvx-paywall-scroll-content--canvas'));
    handle.update({ config: { blocks: { ...canvasDoc, layout: 'flow' } } });
    assert.equal(content.classList.contains('rvx-paywall-scroll-content--canvas'), false);
    const sheet = document.getElementById('rvx-paywall-styles').textContent;
    assert.match(sheet, /\.rvx-paywall-scroll-content--canvas\s*\{\s*padding:\s*0;?\s*\}/);
    assert.match(sheet, /\.rvx-paywall-scroll\s*\{[^}]*overscroll-behavior:\s*contain/);
  });
});

describe('images', () => {
  test('an inset image fills its stack parent on both axes and loads eagerly', () => {
    const screen = render([
      {
        id: 'c',
        type: 'card',
        layout: 'stack',
        children: [{ id: 'k', type: 'image', url: 'https://cdn/x.jpg', style: { inset: true } }],
      },
    ]);
    const node = screen.firstChild.firstChild.firstChild;
    assert.equal(node.style.position, 'absolute');
    assert.equal(node.style.width, '100%');
    assert.equal(node.style.height, '100%');
    const img = node.querySelector('img');
    assert.equal(img.getAttribute('loading'), null, 'the hero is not deferred');
    assert.equal(img.getAttribute('decoding'), null);
  });

  test('an in-flow image is deferred and decoded off the main thread', () => {
    const screen = render([{ id: 'k', type: 'image', url: 'https://cdn/x.jpg' }]);
    const img = screen.firstChild.firstChild.querySelector('img');
    assert.equal(img.getAttribute('loading'), 'lazy');
    assert.equal(img.getAttribute('decoding'), 'async');
    assert.equal(img.style.objectFit, 'cover');
  });

  test('an image with no URL of its own takes the hero image, then the placeholder', () => {
    const withHero = render([{ id: 'k', type: 'image' }], { heroImageUrl: 'https://cdn/hero.jpg' });
    assert.equal(withHero.querySelector('img').getAttribute('src'), 'https://cdn/hero.jpg');
    const slot = render([{ id: 'k', type: 'image', placeholder: 'hero' }]);
    assert.equal(slot.querySelector('img'), null);
    assert.match(slot.textContent, /hero/);
  });
});
