import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

const { RevnixWeb } = await import('../dist/esm/web.js');

describe('identify (Capacitor web)', () => {
  test('is native-only and never uses the JS core', async () => {
    const web = new RevnixWeb();
    await assert.rejects(() => web.identify({ userId: 'u1' }), /mobile only/);
  });
});
