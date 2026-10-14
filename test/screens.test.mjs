import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { beforeEach, describe, test } from 'node:test';
import { JSDOM } from 'jsdom';

const { renderBlockDoc } = await import('../dist/esm/blocks.js');
const { renderRevnixPaywall } = createRequire(import.meta.url)('../dist/plugin.cjs.js');

let window;
let document;
beforeEach(() => {
  window = new JSDOM('<!doctype html><html><head></head><body></body></html>').window;
  document = window.document;
});

const DOC = {
  version: 1,
  layout: 'flow',
  background: '#0B0B12',
  textColor: '#FFFFFF',
  accent: '#7C5CFF',
  accentInk: '#FFFFFF',
  screens: [
    [
      { id: 's1_t', type: 'text', text: 'Welcome' },
      { id: 's1_n', type: 'button', label: 'Continue', action: 'next' },
      { id: 's1_b', type: 'text', text: 'Back', action: 'back' },
    ],
    [
      { id: 's2_t', type: 'text', text: 'Track every workout' },
      { id: 's2_x', type: 'text', text: '×', action: 'close' },
      { id: 's2_b', type: 'text', text: 'Back', action: 'back' },
      { id: 's2_n', type: 'button', label: 'Continue', action: 'next' },
    ],
  ],
  blocks: [
    { id: 'p_t', type: 'text', text: 'Go Pro' },
    { id: 'p_m', type: 'timer', duration: 600, format: '{mm}:{ss}' },
    { id: 'p_p', type: 'products' },
    { id: 'p_b', type: 'button', label: 'Start free trial' },
    { id: 'p_n', type: 'button', label: 'Stray', action: 'next' },
  ],
  locales: { es: { 's1_t.text': 'Bienvenido', 's2_t.text': 'Registra cada entreno', 'p_t.text': 'Hazte Pro' } },
};

const PKGS = [{ packageId: 'annual', productId: 'pro.annual', title: 'Annual', priceLabel: '$59.99' }];

const byId = (root, id) => root.querySelector(`[data-block-id="${id}"]`);
const click = (node) => node.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const fallbackChip = (root) => root.querySelector('button[aria-label="Close"]');
const dotsOf = (root) =>
  [...root.querySelectorAll('div')].find(
    (n) => n.style.pointerEvents === 'none' && n.style.top !== '' && n.childNodes.length > 0,
  );

describe('renderBlockDoc with screens', () => {
  const render = (extra) =>
    renderBlockDoc({ doc: DOC, packages: PKGS, onScreen: () => {}, onClose: () => {}, ...extra }, document);

  test('opens on screens[0]; next and back report the neighbouring index', () => {
    const asked = [];
    const first = render({ onScreen: (i) => asked.push(i) });
    assert.ok(byId(first, 's1_t'));
    assert.equal(byId(first, 'p_t'), null);
    click(byId(first, 's1_n'));
    click(byId(first, 's1_b'));
    const second = render({ screen: 1, onScreen: (i) => asked.push(i) });
    click(byId(second, 's2_b'));
    click(byId(second, 's2_n'));
    assert.deepEqual(asked, [1, 0, 2]);
  });

  test('a next/back button navigates instead of purchasing; meaningless ones are inert', () => {
    const bought = [];
    const asked = [];
    const first = render({ onScreen: (i) => asked.push(i), onPurchase: (id) => bought.push(id) });
    click(byId(first, 's1_n'));
    const paywall = render({ screen: 2, onScreen: (i) => asked.push(i), onPurchase: (id) => bought.push(id) });
    click(byId(paywall, 'p_n'));
    assert.deepEqual(asked, [1]);
    assert.deepEqual(bought, []);
    assert.equal(byId(first, 's1_b').getAttribute('role'), null);
  });

  test('without onScreen a doc with screens opens straight on the paywall', () => {
    const screen = renderBlockDoc({ doc: DOC, packages: PKGS }, document);
    assert.ok(byId(screen, 'p_t'));
    assert.equal(byId(screen, 's1_t'), null);
  });

  test('progress dots only on intro screens, one per screen plus the paywall', () => {
    const first = dotsOf(render());
    assert.equal(first.childNodes.length, 3);
    assert.equal(first.childNodes[0].style.background, 'rgb(124, 92, 255)');
    assert.equal(first.childNodes[1].style.background, 'rgba(255, 255, 255, 0.3)');
    const second = dotsOf(render({ screen: 1 }));
    assert.equal(second.childNodes[1].style.background, 'rgb(124, 92, 255)');
    assert.equal(dotsOf(render({ screen: 2 })), undefined);
    assert.equal(dotsOf(renderBlockDoc({ doc: { ...DOC, screens: undefined }, packages: PKGS }, document)), undefined);
  });

  test('the fallback close follows the current screen', () => {
    assert.ok(fallbackChip(render()));
    assert.equal(fallbackChip(render({ screen: 1 })), null);
    assert.ok(fallbackChip(render({ screen: 2 })));
  });

  test('a duration timer on the paywall counts from shownAt, not from navigation', () => {
    const screen = render({ screen: 2, shownAt: Date.now() - 100_000 });
    assert.match(byId(screen, 'p_m').textContent, /^08:(19|20)$/);
  });
});

describe('renderRevnixPaywall with screens', () => {
  test('one display walks the screens, localized, keeping shownAt and reporting one view', async () => {
    const realNow = Date.now;
    const t0 = realNow();
    Date.now = () => t0;
    const shown = [];
    const closed = [];
    const container = document.createElement('div');
    try {
      renderRevnixPaywall(container, {
        config: { blocks: DOC },
        packages: PKGS,
        locale: 'es',
        onPurchase: () => {},
        onClose: () => closed.push(1),
        placementKey: 'onboarding',
        client: { logPaywallShown: async () => (shown.push(1), { viewId: 'v1' }) },
      });
      assert.equal(byId(container, 's1_t').textContent, 'Bienvenido');
      click(byId(container, 's1_n'));
      assert.equal(byId(container, 's2_t').textContent, 'Registra cada entreno');
      click(byId(container, 's2_b'));
      assert.ok(byId(container, 's1_t'));
      click(byId(container, 's1_n'));
      Date.now = () => t0 + 100_000;
      click(byId(container, 's2_n'));
      assert.equal(byId(container, 'p_t').textContent, 'Hazte Pro');
      assert.equal(byId(container, 'p_m').textContent, '08:20');
      assert.equal(dotsOf(container), undefined);
      click(fallbackChip(container));
    } finally {
      Date.now = realNow;
    }
    assert.deepEqual(shown, [1]);
    assert.deepEqual(closed, [1]);
  });
});

describe('canvas ResizeObserver', () => {
  test('re-rendering on one viewport keeps a single live observer', () => {
    let live = 0;
    const original = window.ResizeObserver;
    window.ResizeObserver = class {
      observe() {
        live += 1;
      }
      disconnect() {
        live -= 1;
      }
    };
    const viewport = document.createElement('div');
    const canvas = { ...DOC, layout: 'canvas' };
    for (let screen = 0; screen < 4; screen++) {
      renderBlockDoc({ doc: canvas, packages: PKGS, screen: screen % 2, viewport, onScreen: () => {} }, document);
    }
    window.ResizeObserver = original;
    assert.equal(live, 1);
  });
});
