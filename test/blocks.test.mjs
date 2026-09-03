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

  test('a tag outside any package card reads the selected package, not the literal', () => {
    // Render contract v2 §2: the renewal-disclosure line every template
    // carries sits at the root, and it must show the price the CTA buys.
    const line = { id: 'f', type: 'text', text: 'then {price}/{period_short}' };
    assert.equal(render([line]).textContent, 'then $59.99/yr');
    assert.equal(render([line], { highlightPackageId: 'monthly' }).textContent, 'then $9.99/mo');
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
    const bought = [];
    const screen = render([{ id: 'b', type: 'button', label: 'Go' }], {
      onPurchase: (id) => bought.push(id),
    });
    screen.firstChild.firstChild.dispatchEvent(new document.defaultView.MouseEvent('click'));
    assert.deepEqual(bought, ['annual']);
  });

  test('the purchase button buys the highlighted package, not the first one', () => {
    const bought = [];
    const screen = render([{ id: 'b', type: 'button', label: 'Go' }], {
      highlightPackageId: 'monthly',
      onPurchase: (id) => bought.push(id),
    });
    screen.firstChild.firstChild.dispatchEvent(new document.defaultView.MouseEvent('click'));
    assert.deepEqual(bought, ['monthly']);
  });
});

describe('plan selection', () => {
  const click = (node) => node.dispatchEvent(new document.defaultView.MouseEvent('click'));

  test('a products card reports the tapped package', () => {
    const picked = [];
    const screen = render([{ id: 'p', type: 'products' }], { onSelect: (id) => picked.push(id) });
    const cards = screen.firstChild.firstChild.childNodes;
    assert.equal(cards.length, 2);
    click(cards[1]);
    assert.deepEqual(picked, ['monthly']);
  });

  test('a repeat card reports the tapped instance', () => {
    const picked = [];
    const screen = render(
      [
        {
          id: 'c',
          type: 'card',
          repeat: 'packages',
          children: [{ id: 't', type: 'text', text: '{title}' }],
        },
      ],
      { onSelect: (id) => picked.push(id) },
    );
    // The repeat wrapper is display:contents, so its instances are the cards.
    const instances = screen.firstChild.firstChild.childNodes;
    assert.equal(instances.length, 2);
    click(instances[1]);
    assert.deepEqual(picked, ['monthly']);
  });

  test('a packageIndex-pinned card reports its own package', () => {
    const picked = [];
    const screen = render(
      [
        {
          id: 'c',
          type: 'card',
          packageIndex: 1,
          children: [{ id: 't', type: 'text', text: '{title}' }],
        },
      ],
      { onSelect: (id) => picked.push(id) },
    );
    click(screen.firstChild.firstChild);
    assert.deepEqual(picked, ['monthly']);
  });

  test('a card naming no package is decoration and stays inert', () => {
    const picked = [];
    const screen = render(
      [{ id: 'c', type: 'card', children: [{ id: 't', type: 'text', text: 'Decoration' }] }],
      { onSelect: (id) => picked.push(id) },
    );
    const card = screen.firstChild.firstChild;
    click(card);
    assert.deepEqual(picked, []);
    // No pointer affordance either, so it never looks tappable.
    assert.notEqual(card.style.cursor, 'pointer');
  });

  test('the selected products card carries the highlight treatment', () => {
    const screen = render([{ id: 'p', type: 'products', highlightSub: 'Best value' }], {
      highlightPackageId: 'monthly',
    });
    const cards = screen.firstChild.firstChild.childNodes;
    // The highlight follows the selection rather than being pinned to first.
    assert.equal(cards[0].textContent.includes('Best value'), false);
    assert.equal(cards[1].textContent.includes('Best value'), true);
  });

  test('a repeat card applies selectedStyle to the selected instance only', () => {
    const screen = render(
      [
        {
          id: 'c',
          type: 'card',
          repeat: 'packages',
          style: { radius: 4 },
          selectedStyle: { radius: 20 },
          children: [{ id: 't', type: 'text', text: '{title}' }],
        },
      ],
      { highlightPackageId: 'monthly' },
    );
    const instances = screen.firstChild.firstChild.childNodes;
    assert.equal(instances[0].style.borderRadius, '4px');
    assert.equal(instances[1].style.borderRadius, '20px');
  });

  test('a pinned card takes selectedStyle when it is the selected one', () => {
    const pinned = (index) => ({
      id: `c${index}`,
      type: 'card',
      packageIndex: index,
      style: { radius: 4 },
      selectedStyle: { radius: 20 },
      children: [{ id: `t${index}`, type: 'text', text: '{title}' }],
    });
    const screen = render([pinned(0), pinned(1)], { highlightPackageId: 'monthly' });
    const cards = screen.firstChild.childNodes;
    // Tapping a pinned card changes what the CTA buys, so it has to show it.
    assert.equal(cards[0].style.borderRadius, '4px');
    assert.equal(cards[1].style.borderRadius, '20px');
  });

  test('a CTA inside a plan card consumes its own tap', () => {
    const picked = [];
    const bought = [];
    const screen = render(
      [
        {
          id: 'c',
          type: 'card',
          packageIndex: 1,
          children: [{ id: 'b', type: 'button', label: 'Go' }],
        },
      ],
      { onSelect: (id) => picked.push(id), onPurchase: (id) => bought.push(id) },
    );
    click(screen.firstChild.firstChild.firstChild);
    // The click must not also bubble to the card: doing so would charge the
    // previously selected package and only then move the selection.
    assert.deepEqual(bought, ['annual']);
    assert.deepEqual(picked, []);
  });

  test('no packages leaves the tree inert rather than throwing', () => {
    const picked = [];
    const screen = renderBlockDoc(
      {
        doc: { ...DOC, blocks: [{ id: 'p', type: 'products' }, { id: 'b', type: 'button', label: 'Go' }] },
        packages: [],
        onSelect: (id) => picked.push(id),
        onPurchase: (id) => picked.push(id),
      },
      document,
    );
    click(screen.firstChild.childNodes[1]);
    assert.deepEqual(picked, []);
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

// REV-252: the close affordance. Two mechanisms with one rule between them —
// a design MAY mark an element `action: "close"`, and the renderer supplies a
// close of its own ONLY when the design marks none. Exercised through the
// real DOM because the wiring that matters (the click listener, the pinned
// chip, the tap not bubbling into a plan card) only exists once rendered.
describe('close affordance', () => {
  const TEXT = { id: 'b1', type: 'text', text: 'Go Pro' };
  const fallbackOf = (screen) => screen.querySelector('[aria-label="Close"]');

  test('a design authoring no close gets one from the renderer', () => {
    const screen = render([TEXT], { onClose: () => {} });
    assert.ok(fallbackOf(screen), 'expected the renderer to supply a close');
  });

  test('no onClose means no close is drawn at all', () => {
    // A dead close button is worse than none: the host performs dismissal, so
    // without a handler there is nothing the chip could do.
    assert.equal(fallbackOf(render([TEXT])), null);
  });

  test('a design authoring its own close gets no second one', () => {
    const screen = render(
      [TEXT, { id: 'x', type: 'text', text: '×', action: 'close' }],
      { onClose: () => {} },
    );
    // The authored chip carries the aria-label too, so count the pinned one.
    assert.equal(screen.querySelectorAll('button[aria-label="Close"]').length, 0);
  });

  test('an authored close nested in a card still suppresses the fallback', () => {
    const screen = render(
      [
        {
          id: 'c',
          type: 'card',
          layout: 'stack',
          children: [{ id: 'x', type: 'text', text: '×', action: 'close' }],
        },
      ],
      { onClose: () => {} },
    );
    assert.equal(screen.querySelectorAll('button[aria-label="Close"]').length, 0);
  });

  test('the renderer-supplied chip dismisses when clicked', () => {
    let closed = 0;
    const screen = render([TEXT], { onClose: () => { closed += 1; } });
    fallbackOf(screen).dispatchEvent(new document.defaultView.MouseEvent('click', { bubbles: true }));
    assert.equal(closed, 1);
  });

  test('an authored close element dismisses when clicked', () => {
    let closed = 0;
    const screen = render(
      [{ id: 'x', type: 'text', text: '×', action: 'close' }],
      { onClose: () => { closed += 1; } },
    );
    screen.querySelector('[aria-label="Close"]')
      .dispatchEvent(new document.defaultView.MouseEvent('click', { bubbles: true }));
    assert.equal(closed, 1);
  });

  test('a close inside a plan card does not also select that plan', () => {
    // The chip consumes its own tap. Without that, dismissing from a card
    // would move the selection on the way out.
    let closed = 0;
    const selected = [];
    const screen = render(
      [
        {
          id: 'card',
          type: 'card',
          layout: 'stack',
          packageIndex: 0,
          children: [{ id: 'x', type: 'text', text: '×', action: 'close' }],
        },
      ],
      { onClose: () => { closed += 1; }, onSelect: (id) => selected.push(id) },
    );
    screen.querySelector('[aria-label="Close"]')
      .dispatchEvent(new document.defaultView.MouseEvent('click', { bubbles: true }));
    assert.equal(closed, 1);
    assert.deepEqual(selected, []);
  });

  test('a button marked close dismisses instead of purchasing', () => {
    let closed = 0;
    const purchased = [];
    const screen = render(
      [{ id: 'b', type: 'button', label: 'Not now', action: 'close' }],
      { onClose: () => { closed += 1; }, onPurchase: (id) => purchased.push(id) },
    );
    const button = screen.querySelector('button');
    button.dispatchEvent(new document.defaultView.MouseEvent('click', { bubbles: true }));
    assert.equal(closed, 1);
    assert.deepEqual(purchased, [], 'a dismiss must never charge');
    // And it drops the accent fill, so it cannot compete with the real CTA.
    assert.equal(button.style.background, 'transparent');
  });

  test('a close inside a conditional card does not suppress the fallback', () => {
    // A `repeat` card renders once per package (none, on an empty offering)
    // and a `packageIndex` card is hidden when the offering does not reach
    // that index — so a close inside one MIGHT not render. Suppressing on it
    // would leave the customer with no way out, the exact bug this fixes.
    const close = { id: 'x', type: 'text', text: 'X', action: 'close' };
    for (const card of [
      { id: 'c', type: 'card', repeat: 'packages', children: [close] },
      { id: 'c', type: 'card', packageIndex: 5, children: [close] },
    ]) {
      const screen = render([card], { onClose: () => {} });
      assert.ok(fallbackOf(screen), 'a conditional close must not suppress the fallback');
    }
    // A plain card is unconditional, so its close DOES suppress.
    const plain = render([{ id: 'c', type: 'card', children: [close] }], { onClose: () => {} });
    assert.equal(plain.querySelectorAll('button[aria-label="Close"]').length, 0);
  });

  test('an unknown action value leaves the element decorative', () => {
    // Forward compatibility both ways: a future action this SDK does not know
    // must not be mistaken for a close, and must not suppress the fallback.
    const screen = render(
      [{ id: 't', type: 'text', text: '?', action: 'purchase' }],
      { onClose: () => {} },
    );
    assert.ok(fallbackOf(screen), 'an unknown action must not suppress the fallback');
  });
});
