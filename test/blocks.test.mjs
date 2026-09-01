// Block-paywall renderer tests.
//
// Runs against the COMPILED output (dist/esm) with jsdom for the DOM, which
// is what `npm test` builds first — the published artifact is what an app
// actually loads, so that is what is exercised here.
//
// The emphasis is the two guarantees a shipped app depends on and cannot be
// patched into later: a document from a newer dashboard still renders, and a
// tag with no data behind it never resolves to a wrong price.

import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { JSDOM } from 'jsdom';

const { asBlockDoc, renderBlockDoc, resolveTags, minorUnitsForCurrency } = await import('../dist/esm/blocks.js');

let document;
before(() => {
  document = new JSDOM('<!doctype html><body></body>').window.document;
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

describe('document validation', () => {
  test('a well-formed document is accepted', () => {
    assert.ok(asBlockDoc({ ...DOC, blocks: [{ id: 'a', type: 'text', text: 'hi' }] }));
  });

  test('anything that is not a block document is rejected, so the caller falls back', () => {
    for (const value of [undefined, null, 'blocks', 42, [], {}, { blocks: [] }, { blocks: 'no' }]) {
      assert.equal(asBlockDoc(value), null, `${JSON.stringify(value)} should not be a document`);
    }
  });

  test('a document missing its palette is rejected rather than rendered colourless', () => {
    assert.equal(asBlockDoc({ version: 1, blocks: [{ id: 'a', type: 'text', text: 'x' }] }), null);
  });
});

describe('the nine block types render', () => {
  test('each type produces a node', () => {
    const blocks = [
      { id: 't', type: 'text', text: 'Headline' },
      { id: 'i', type: 'image', placeholder: 'hero' },
      { id: 'l', type: 'list', items: [{ title: 'Offline downloads' }] },
      { id: 'p', type: 'products' },
      { id: 'b', type: 'button', label: 'Continue' },
      { id: 'k', type: 'links' },
      { id: 'n', type: 'line' },
      { id: 's', type: 'spacer' },
      { id: 'c', type: 'card', layout: 'column', children: [{ id: 'c1', type: 'text', text: 'inside' }] },
    ];
    const screen = render(blocks);
    assert.equal(screen.firstChild.childNodes.length, blocks.length);
    assert.match(screen.textContent, /Headline/);
    assert.match(screen.textContent, /Offline downloads/);
    assert.match(screen.textContent, /Continue/);
    assert.match(screen.textContent, /inside/);
  });

  test('the four container layouts map onto their CSS primitives', () => {
    const of = (layout) => {
      const screen = render([{ id: 'c', type: 'card', layout, children: [] }]);
      return screen.firstChild.firstChild.style;
    };
    assert.equal(of('column').flexDirection, 'column');
    assert.equal(of('row').flexDirection, 'row');
    // stack layers its children: it is a positioning context, not a flex line.
    assert.equal(of('stack').position, 'relative');
    assert.equal(of('stack').display, '');
    assert.equal(of('grid').display, 'grid');
  });

  test('a grid uses its own track list when the design gives one', () => {
    const screen = render([{ id: 'c', type: 'card', layout: 'grid', gridColumns: '1fr 60px', children: [] }]);
    assert.equal(screen.firstChild.firstChild.style.gridTemplateColumns, '1fr 60px');
  });
});

describe('an app cannot be patched, so nothing may crash the screen', () => {
  test('an unknown block type is skipped and its siblings still render', () => {
    const screen = render([
      { id: 'a', type: 'text', text: 'before' },
      { id: 'x', type: 'hologram', text: 'from a newer dashboard' },
      { id: 'b', type: 'text', text: 'after' },
    ]);
    assert.match(screen.textContent, /before/);
    assert.match(screen.textContent, /after/);
    assert.doesNotMatch(screen.textContent, /newer dashboard/);
    assert.equal(screen.firstChild.childNodes.length, 2);
  });

  test('an unknown container layout falls back to a column instead of vanishing', () => {
    const screen = render([
      { id: 'c', type: 'card', layout: 'carousel', children: [{ id: 'k', type: 'text', text: 'kept' }] },
    ]);
    assert.match(screen.textContent, /kept/);
    assert.equal(screen.firstChild.firstChild.style.flexDirection, 'column');
  });

  test('an unknown style field is ignored and the known ones still apply', () => {
    const screen = render([
      { id: 't', type: 'text', text: 'x', style: { fontSize: 22, teleport: 'yes', radius: 8 } },
    ]);
    const style = screen.firstChild.firstChild.style;
    assert.equal(style.fontSize, '22px');
    assert.equal(style.borderRadius, '8px');
  });

  test('a malformed block is skipped rather than thrown on', () => {
    const screen = render([null, { id: 'a', type: 'text', text: 'survivor' }, { type: 'list' }]);
    assert.match(screen.textContent, /survivor/);
  });

  test('a plan card whose package the offering does not reach is dropped, not left with raw tags', () => {
    const screen = render([
      { id: 'c', type: 'card', packageIndex: 7, children: [{ id: 'k', type: 'text', text: '{price}' }] },
    ]);
    assert.equal(screen.firstChild.childNodes.length, 0);
    assert.doesNotMatch(screen.textContent, /\{price\}/);
  });
});

describe('tag variables resolve against the live packages', () => {
  const [annual, monthly] = PKGS;

  test('the price comes from the store, never from the design', () => {
    assert.equal(resolveTags('{price}', annual, PKGS), '$59.99');
    assert.equal(resolveTags('{title} — {price}/{period_short}', annual, PKGS), 'Annual — $59.99/yr');
    assert.equal(resolveTags('every {period}', monthly, PKGS), 'every month');
  });

  test('a tag with no data behind it stays visible rather than resolving wrong', () => {
    // No period and no money: per-month and saving cannot be computed, and a
    // guess here would be a price the store will not charge.
    const bare = { packageId: 'x', title: 'Pro', priceLabel: '$1' };
    assert.equal(resolveTags('{price_per_month}', bare, [bare]), '{price_per_month}');
    assert.equal(resolveTags('{save_percent}', bare, [bare]), '{save_percent}');
    assert.equal(resolveTags('{period}', bare, [bare]), '{period}');
  });

  test('an unknown tag is left in place', () => {
    assert.equal(resolveTags('{quantum_discount}', annual, PKGS), '{quantum_discount}');
  });

  test('per-month and saving are computed from minor units', () => {
    // A whole amount reads without its ".00" — $59.99/12 rounds to exactly $5.
    assert.equal(resolveTags('{price_per_month}', annual, PKGS), '$5');
    assert.equal(resolveTags('{save_percent}', annual, PKGS), '50%');
    // The dearest plan has nothing to beat, so its saving stays unresolved.
    assert.equal(resolveTags('{save_percent}', monthly, PKGS), '{save_percent}');
  });

  test('currencies without a minor unit are not divided by 100', () => {
    assert.equal(minorUnitsForCurrency('JPY'), 1);
    assert.equal(minorUnitsForCurrency('USD'), 100);
    const yen = { packageId: 'y', title: 'Yr', priceLabel: '¥12,000', period: 'annual', amountMinor: 12000, currency: 'JPY' };
    assert.match(resolveTags('{price_per_month}', yen, [yen]), /1,000/);
  });

  test('tags render inside a repeated plan card, one package each', () => {
    const screen = render([
      {
        id: 'c',
        type: 'card',
        repeat: 'packages',
        children: [{ id: 'k', type: 'text', text: '{title} {price}' }],
      },
    ]);
    assert.match(screen.textContent, /Annual \$59\.99/);
    assert.match(screen.textContent, /Monthly \$9\.99/);
  });
});

describe('style fields', () => {
  test('per-side borders, aspect ratio, shrink and wrap all reach the DOM', () => {
    const screen = render([
      {
        id: 't',
        type: 'text',
        text: 'x',
        style: {
          borderBottom: '1px solid #fff',
          aspectRatio: '16/9',
          shrink: 0,
          wrap: true,
          basis: 250,
          selfAlign: 'start',
        },
      },
    ]);
    const style = screen.firstChild.firstChild.style;
    // The DOM serializes the colour, so compare on that rather than the hex.
    assert.equal(style.borderBottom, '1px solid rgb(255, 255, 255)');
    assert.equal(style.aspectRatio, '16/9');
    assert.equal(style.flexShrink, '0');
    assert.equal(style.flexWrap, 'wrap');
    assert.equal(style.flexBasis, '250px');
    assert.equal(style.alignSelf, 'flex-start');
  });

  test('stack placement pins a child absolutely', () => {
    const screen = render([
      {
        id: 'c',
        type: 'card',
        layout: 'stack',
        children: [{ id: 'k', type: 'text', text: 'badge', style: { top: 8, right: 12 } }],
      },
    ]);
    const badge = screen.firstChild.firstChild.firstChild.style;
    assert.equal(badge.position, 'absolute');
    assert.equal(badge.top, '8px');
    assert.equal(badge.right, '12px');
  });

  test('inset fills the stack', () => {
    const screen = render([
      { id: 'c', type: 'card', layout: 'stack', children: [{ id: 'k', type: 'image', style: { inset: true } }] },
    ]);
    assert.equal(screen.firstChild.firstChild.firstChild.style.position, 'absolute');
  });

  test('palette tokens expand to the screen palette, with alpha', () => {
    const screen = render([{ id: 't', type: 'text', text: 'x', style: { textColor: '@accent', fill: '@text/12' } }]);
    const style = screen.firstChild.firstChild.style;
    assert.equal(style.color, 'rgb(100, 120, 255)');
    assert.match(style.background, /rgba\(245, 247, 250, 0\.12\)/);
  });
});

describe('links and purchase wiring', () => {
  test('the host handler wins over the config URL', () => {
    let restored = 0;
    const screen = render([{ id: 'k', type: 'links', termsUrl: 'https://example.com/terms' }], {
      onRestore: () => (restored += 1),
      footer: {},
    });
    const node = screen.firstChild.firstChild;
    node.firstChild.dispatchEvent(new document.defaultView.MouseEvent('click'));
    assert.equal(restored, 1);
    // Terms has a URL but no handler, so it is a real anchor.
    assert.equal(node.childNodes[1].tagName, 'A');
    assert.equal(node.childNodes[1].getAttribute('href'), 'https://example.com/terms');
  });

  test('a links block with everything switched off renders nothing', () => {
    const screen = render([{ id: 'k', type: 'links', showRestore: false, showTerms: false, showPrivacy: false }]);
    assert.equal(screen.firstChild.childNodes.length, 0);
  });

  test('the purchase button reports the selected package', () => {
    let bought = 0;
    const screen = render([{ id: 'b', type: 'button', label: 'Go' }], { onPurchase: () => (bought += 1) });
    screen.firstChild.firstChild.dispatchEvent(new document.defaultView.MouseEvent('click'));
    assert.equal(bought, 1);
  });
});

describe('canvas documents', () => {
  test('a canvas doc lays out at the design size and scales as a whole', () => {
    const screen = renderBlockDoc(
      { doc: { ...DOC, layout: 'canvas', blocks: [{ id: 't', type: 'text', text: 'x' }] }, packages: PKGS },
      document,
    );
    const body = screen.firstChild;
    assert.equal(body.style.width, '393px');
    assert.equal(body.style.height, '852px');
    assert.equal(body.style.transformOrigin, 'top left');
    // Authored against the UA default line height, so the host page's own
    // cannot stretch a tight screen past the canvas.
    assert.equal(body.style.lineHeight, 'normal');
  });
});
