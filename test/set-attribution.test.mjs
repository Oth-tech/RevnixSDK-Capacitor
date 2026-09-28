import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

const { RevnixWeb } = await import('../dist/esm/web.js');

describe('PT11 attribution import (Capacitor web)', () => {
  test('setAttribution rejects before configure, like every other beacon', async () => {
    const web = new RevnixWeb();
    await assert.rejects(
      () => web.setAttribution({ provider: 'adjust', network: 'facebook' }),
      /configure/,
    );
  });
});
