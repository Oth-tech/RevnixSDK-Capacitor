import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

const { RevnixWeb } = await import('../dist/esm/web.js');

describe('AT1 install attribution (Capacitor web)', () => {
  test('getAttribution resolves null, even before configure', async () => {
    const web = new RevnixWeb();
    const { attribution } = await web.getAttribution();
    assert.equal(attribution, null);
  });

  test('never emits an attribution event', async () => {
    const web = new RevnixWeb();
    const emitted = [];
    web.notifyListeners = (event, data) => emitted.push({ event, data });
    await web.getAttribution();
    assert.equal(emitted.length, 0);
  });
});
