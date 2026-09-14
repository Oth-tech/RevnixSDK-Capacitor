import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, test } from 'node:test';
import { JSDOM } from 'jsdom';

// dist/esm/ui.js's extensionless import of './blocks' cannot be followed by
// node's ESM loader, so this loads the cjs rollup instead.
const { renderRevnixPaywall, PREVIEW_PLACEMENT_KEY } = createRequire(import.meta.url)('../dist/plugin.cjs.js');

const CONFIG = {
  template: 'focus',
  headline: 'Go Pro',
  features: [],
  ctaLabel: 'Continue',
};

const PACKAGES = [{ packageId: 'annual', title: 'Annual', priceLabel: '$59.99/yr' }];

function makeContainer() {
  const window = new JSDOM('<!doctype html><body></body></html>').window;
  // The classic (non-block) layout reads the global HTMLElement to preserve
  // focus across a re-render; a real WebView always has one, jsdom's window
  // does not become the global by itself.
  globalThis.HTMLElement = window.HTMLElement;
  const container = window.document.createElement('div');
  window.document.body.appendChild(container);
  return { window, container };
}

describe('PREVIEW_PLACEMENT_KEY', () => {
  test('is the wire-agreed preview key', () => {
    assert.equal(PREVIEW_PLACEMENT_KEY, 'revnix_preview');
  });

  test('a CTA tap does not call onPurchase and alerts instead', () => {
    const { window, container } = makeContainer();
    let purchased;
    let alerted;
    window.alert = (message) => {
      alerted = message;
    };
    renderRevnixPaywall(container, {
      config: CONFIG,
      packages: PACKAGES,
      placementKey: PREVIEW_PLACEMENT_KEY,
      onPurchase: (id) => {
        purchased = id;
      },
    });
    container.querySelector('.rvx-paywall-cta').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    assert.equal(purchased, undefined);
    assert.equal(alerted, 'Purchases are disabled in preview.');
  });

  test('a designed paywall purchase block routes through the same guard', () => {
    const { window, container } = makeContainer();
    let purchased;
    window.alert = () => {};
    renderRevnixPaywall(container, {
      config: {
        ...CONFIG,
        blocks: {
          version: 1,
          layout: 'flow',
          background: '#000',
          textColor: '#fff',
          accent: '#6478ff',
          accentInk: '#000',
          blocks: [{ id: 'b', type: 'button', label: 'Go' }],
        },
      },
      packages: PACKAGES,
      placementKey: PREVIEW_PLACEMENT_KEY,
      onPurchase: (id) => {
        purchased = id;
      },
    });
    container.querySelector('button.rvx-block-button').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    assert.equal(purchased, undefined);
  });

  test('no logPaywallShown call for the preview key', () => {
    const { container } = makeContainer();
    let shown = 0;
    renderRevnixPaywall(container, {
      config: CONFIG,
      packages: PACKAGES,
      placementKey: PREVIEW_PLACEMENT_KEY,
      onPurchase: () => {},
      client: {
        logPaywallShown: () => {
          shown += 1;
          return { viewId: 'v1' };
        },
      },
    });
    assert.equal(shown, 0);
  });

  test('a non-preview placementKey is unaffected: onPurchase fires and the view is reported', () => {
    const { window, container } = makeContainer();
    let purchased;
    let shown = 0;
    const handle = renderRevnixPaywall(container, {
      config: CONFIG,
      packages: PACKAGES,
      placementKey: 'main_paywall',
      onPurchase: (id) => {
        purchased = id;
      },
      client: {
        logPaywallShown: () => {
          shown += 1;
          return { viewId: 'v1' };
        },
      },
    });
    container.querySelector('.rvx-paywall-cta').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    assert.equal(purchased, 'annual');
    assert.equal(shown, 1);
    handle.destroy();
  });
});
