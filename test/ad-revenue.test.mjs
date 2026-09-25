import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

const { RevnixWeb } = await import('../dist/esm/web.js');

describe('PT8 ad revenue (Capacitor web)', () => {
  test('logAdRevenue rejects before configure, like every other beacon', async () => {
    const web = new RevnixWeb();
    await assert.rejects(
      () => web.logAdRevenue({ revenue: 0.0032, currency: 'USD' }),
      /configure/,
    );
  });
});
