import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

const { RevnixWeb } = await import('../dist/esm/web.js');

describe('REV-299 deferred deep links (Capacitor web)', () => {
  test('handleInstallReferrer resolves as a no-op, even before configure', async () => {
    const web = new RevnixWeb();
    await assert.doesNotReject(() => web.handleInstallReferrer({ referrer: 'utm_source=x' }));
  });

  test('never emits a deferredDeepLink event', async () => {
    const web = new RevnixWeb();
    const emitted = [];
    web.notifyListeners = (event, data) => emitted.push({ event, data });
    await web.handleInstallReferrer({ referrer: 'utm_source=x' });
    assert.equal(emitted.length, 0);
  });
});
