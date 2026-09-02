// Block fills in the WebView renderer.
//
// A `fill` is handed straight to CSS `background`, so a gradient renders here
// for free — this SDK is the one place the ticket did not have to teach a
// gradient to paint. What it DID have to fix is the opposite case: a gradient
// in a field CSS has no gradient form for. Assigning one to the `border`
// shorthand makes the CSSOM discard the whole declaration, so the stroke
// vanished with no error and no way to know.
//
// Runs against the COMPILED output (dist/esm) with jsdom, like the rest of the
// suite: the published artifact is what an app actually loads.

import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { JSDOM } from 'jsdom';

const { applyBlockStyle, flatColor, isGradient, backgroundBaseColor, resolveColor } =
  await import('../dist/esm/blocks.js');

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

const GRADIENT = 'linear-gradient(135deg, #112233 0%, #445566 100%)';

describe('a gradient fill', () => {
  test('reaches CSS background untouched — the WebView paints it', () => {
    const node = document.createElement('div');
    applyBlockStyle(node, { fill: GRADIENT }, DOC);
    // jsdom normalises whitespace but keeps the function, which is the point:
    // the declaration survives rather than being dropped.
    assert.ok(node.style.background.includes('linear-gradient'));
  });

  test('a stacked fill keeps both layers', () => {
    const node = document.createElement('div');
    const css =
      'radial-gradient(120% 90% at 86% 4%, #FF3D7F 0%, rgba(255,61,127,0) 48%),' +
      'linear-gradient(180deg, #1C1046 0%, #0E0722 100%)';
    applyBlockStyle(node, { fill: css }, DOC);
    assert.ok(node.style.background.includes('radial-gradient'));
    assert.ok(node.style.background.includes('linear-gradient'));
  });

  test('palette tokens inside a gradient still expand', () => {
    const node = document.createElement('div');
    applyBlockStyle(node, { fill: 'linear-gradient(90deg, @accent 0%, #16203C 100%)' }, DOC);
    assert.ok(node.style.background.includes('rgb(100, 120, 255)')
      || node.style.background.includes('#6478ff'));
  });
});

describe('colour-only fields', () => {
  test('a gradient border collapses instead of dropping the whole rule', () => {
    const node = document.createElement('div');
    applyBlockStyle(node, { borderWidth: 2, borderColor: GRADIENT }, DOC);
    // Before the fix this produced `2px solid linear-gradient(...)`, which the
    // CSSOM rejects outright — no border at all.
    assert.notEqual(node.style.border, '');
    assert.ok(!node.style.border.includes('gradient'));
  });

  test('a plain border colour is unchanged', () => {
    const node = document.createElement('div');
    applyBlockStyle(node, { borderWidth: 1, borderColor: '#FF0000' }, DOC);
    assert.ok(node.style.border.includes('1px'));
    assert.ok(node.style.border.includes('solid'));
  });

  test('the renderer reports what it had to flatten', () => {
    const node = document.createElement('div');
    const reported = [];
    applyBlockStyle(node, { borderColor: GRADIENT }, DOC, (m) => reported.push(m));
    assert.equal(reported.length, 1);
    assert.ok(reported[0].includes('flattened'));
  });

  test('nothing is reported for a value CSS can take', () => {
    const node = document.createElement('div');
    const reported = [];
    applyBlockStyle(node, { fill: GRADIENT, borderColor: '@accent' }, DOC, (m) => reported.push(m));
    assert.deepEqual(reported, []);
  });

  test('flatColor answers a gradient with its ground stop', () => {
    assert.equal(flatColor(GRADIENT, DOC), '#112233');
    assert.equal(flatColor('#FF0000', DOC), '#FF0000');
    assert.equal(flatColor(undefined, DOC), undefined);
  });

  test('isGradient tells the two apart', () => {
    assert.equal(isGradient(GRADIENT), true);
    assert.equal(isGradient('#112233'), false);
    assert.equal(isGradient('rgba(0, 0, 0, 0.5)'), false);
  });
});

describe('@bg over a gradient ground', () => {
  const gradientDoc = {
    ...DOC,
    background: 'linear-gradient(180deg, #231646 0%, #0C0C13 100%)',
  };

  test('resolves to the ground flat base, which color-mix can actually take', () => {
    assert.equal(resolveColor('@bg', gradientDoc), '#231646');
    assert.equal(backgroundBaseColor(gradientDoc.background), '#231646');
  });

  test('a @bg tint over a gradient ground produces valid CSS', () => {
    const node = document.createElement('div');
    applyBlockStyle(node, { fill: '@bg/40' }, gradientDoc);
    assert.notEqual(node.style.background, '');
    assert.ok(!node.style.background.includes('linear-gradient'));
  });
});
