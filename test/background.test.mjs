// The screen background: the wire contract and the layer stack.
//
// Runs against the COMPILED output (dist/esm) with jsdom, like the block
// renderer tests — the published artifact is what an app actually loads.
//
// `paywall-background-wire.json` is a byte-identical copy of the fixture the
// other five renderers decode in their own suites — a real document the
// dashboard published from its background library. It is the closest thing
// this SDK has to a cross-repo contract test, and it exists because the six
// renderers previously disagreed about the ground's key with nothing to catch
// it.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, describe, test } from 'node:test';
import { JSDOM } from 'jsdom';

const { backgroundLayers, backgroundCss, backgroundBaseColor, asBlockDoc, renderBlockDoc } =
  await import('../dist/esm/blocks.js');

const golden = JSON.parse(
  readFileSync(new URL('./paywall-background-wire.json', import.meta.url), 'utf8'),
);

const GOLDEN_GROUND =
  'radial-gradient(120% 85% at 50% 0%, #D6FF3F38 0%, #D6FF3F00 58%), ' +
  'linear-gradient(180deg, #111820 0%, #07090C 100%)';

let document;
before(() => {
  document = new JSDOM('<!doctype html><body></body>').window.document;
});

describe('the wire contract', () => {
  test('a real published document resolves to its gradient ground, not black', () => {
    const doc = asBlockDoc(golden);
    assert.ok(doc);
    assert.equal(backgroundLayers(doc.background).ground, GOLDEN_GROUND);
    assert.notEqual(backgroundCss(doc.background), '#000000');
  });

  test('the ground key is color, not ground', () => {
    // `ground` is the name of the RESOLVED layer, and a key the dashboard has
    // never written. Decoding it off the wire is what painted every edited
    // paywall black.
    assert.equal(backgroundCss({ color: '#0B0D10' }), '#0B0D10');
  });

  test('the legacy ground key is still accepted so no published document breaks', () => {
    assert.equal(backgroundCss({ ground: '#0B0D10' }), '#0B0D10');
  });

  test('color wins over ground when a document somehow carries both', () => {
    assert.equal(backgroundCss({ color: '#111820', ground: '#FF0000' }), '#111820');
  });

  test('a plain string is the legacy ground, and nothing is black', () => {
    assert.equal(backgroundCss('#0B0D10'), '#0B0D10');
    assert.equal(backgroundCss(undefined), '#000000');
    assert.equal(backgroundCss({}), '#000000');
  });
});

describe('the layer stack', () => {
  test('a legacy string resolves to exactly one ground layer', () => {
    const layers = backgroundLayers('#0A0B0D');
    assert.equal(layers.ground, '#0A0B0D');
    assert.equal(layers.image, undefined);
    assert.equal(layers.overlay, undefined);
  });

  test('a photo carries its fit, focal point, opacity and blur', () => {
    const { image } = backgroundLayers({
      color: '#000',
      image: { url: 'https://x/y.jpg', fit: 'contain', focalX: 20, focalY: 35, opacity: 70, blur: 8 },
    });
    assert.equal(image.url, 'https://x/y.jpg');
    assert.equal(image.fit, 'contain');
    assert.equal(image.focalX, 20);
    assert.equal(image.focalY, 35);
    assert.equal(image.position, '20% 35%');
    assert.ok(Math.abs(image.opacity - 0.7) < 0.0001);
    assert.equal(image.blur, 8);
  });

  test('photo defaults are cover, centred, opaque and unblurred', () => {
    const { image } = backgroundLayers({ image: { url: 'https://x/y.jpg' } });
    assert.equal(image.fit, 'cover');
    assert.equal(image.position, '50% 50%');
    assert.equal(image.opacity, 1);
    assert.equal(image.blur, undefined);
  });

  test('layers that would draw nothing are dropped rather than emitted', () => {
    // A zero-opacity photo and a urlless one are both no-ops; emitting them
    // would cost a box that paints nothing.
    assert.equal(backgroundLayers({ image: { fit: 'cover' } }).image, undefined);
    assert.equal(
      backgroundLayers({ image: { url: 'https://x/y.jpg', opacity: 0 } }).image,
      undefined,
    );
    assert.equal(backgroundLayers({ overlay: { fill: '#000', opacity: 0 } }).overlay, undefined);
  });

  test('focal point and opacity are clamped to their ranges', () => {
    const { image } = backgroundLayers({
      image: { url: 'https://x/y.jpg', focalX: -40, focalY: 900, opacity: 400 },
    });
    assert.equal(image.focalX, 0);
    assert.equal(image.focalY, 100);
    assert.equal(image.opacity, 1);
  });

  test('a scrim carries its fill and opacity', () => {
    const { overlay } = backgroundLayers({ overlay: { fill: '#000000', opacity: 40 } });
    assert.equal(overlay.fill, '#000000');
    assert.ok(Math.abs(overlay.opacity - 0.4) < 0.0001);
  });
});

describe('@bg base colour', () => {
  test('a stacked gradient answers with the BOTTOM layer, not the glow on top', () => {
    // In CSS the first-listed layer paints on top. The fixture stacks a
    // translucent lime glow over a near-black base; answering with the glow
    // would tint every @bg fill lime.
    assert.equal(backgroundBaseColor(golden.background), '#111820');
  });

  test('a single gradient answers with its first stop', () => {
    assert.equal(backgroundBaseColor('linear-gradient(180deg, #111820, #07090C)'), '#111820');
  });

  test('a fully transparent stop is skipped, since it says nothing about the ground', () => {
    assert.equal(
      backgroundBaseColor('linear-gradient(180deg, #D6FF3F00 0%, #111820 100%)'),
      '#111820',
    );
  });

  test('a flat colour answers with itself, and nothing answers black', () => {
    assert.equal(backgroundBaseColor('#0A0B0D'), '#0A0B0D');
    assert.equal(backgroundBaseColor(undefined), '#000000');
  });
});

describe('rendering', () => {
  test('the golden document paints its gradient ground on the screen element', () => {
    const doc = asBlockDoc(golden);
    const screen = renderBlockDoc({ doc, packages: [] }, document);
    assert.ok(screen.style.background.includes('linear-gradient'));
    assert.ok(!screen.style.background.startsWith('#000000'));
  });

  test('an unedited flat background produces no extra art boxes', () => {
    // The whole point of dropping empty layers: a paywall nobody has restyled
    // must render exactly as it did before.
    const doc = asBlockDoc({ ...golden, background: '#101014' });
    const screen = renderBlockDoc({ doc, packages: [] }, document);
    assert.equal(screen.style.background, 'rgb(16, 16, 20)');
    assert.equal(screen.childNodes.length, 1);
  });

  test('a photo and scrim are painted as their own absolutely positioned boxes', () => {
    const doc = asBlockDoc({
      ...golden,
      background: {
        color: '#101014',
        image: { url: 'https://cdn/x.jpg', focalX: 50, focalY: 35 },
        overlay: { fill: '#000000', opacity: 40 },
      },
    });
    const screen = renderBlockDoc({ doc, packages: [] }, document);
    // ground on the screen itself, then photo, then scrim, then the body.
    assert.equal(screen.childNodes.length, 3);
    const [photo, scrim] = screen.childNodes;
    assert.ok(photo.style.backgroundImage.includes('https://cdn/x.jpg'));
    assert.equal(photo.style.backgroundPosition, '50% 35%');
    assert.equal(photo.style.position, 'absolute');
    assert.equal(scrim.style.opacity, '0.4');
  });

  test('a blurred photo is wrapped in a clip, so the 1.1 scale cannot escape the screen', () => {
    // Only the canvas branch clips; without this wrapper a blurred flow
    // paywall paints its photo over whatever sits around it.
    const doc = asBlockDoc({
      ...golden,
      background: { color: '#101014', image: { url: 'https://cdn/x.jpg', blur: 12 } },
    });
    const screen = renderBlockDoc({ doc, packages: [] }, document);
    const clip = screen.childNodes[0];
    assert.equal(clip.style.overflow, 'hidden');
    const photo = clip.childNodes[0];
    assert.equal(photo.style.transform, 'scale(1.1)');
    assert.equal(photo.style.filter, 'blur(12px)');
  });
});
