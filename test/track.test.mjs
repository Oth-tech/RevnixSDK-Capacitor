import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

const { RevnixWeb } = await import('../dist/esm/web.js');

describe('MS8 custom events (Capacitor web)', () => {
  test('track rejects before configure, like every other beacon', async () => {
    const web = new RevnixWeb();
    await assert.rejects(() => web.track({ event: 'level_up' }), /configure/);
  });
});
