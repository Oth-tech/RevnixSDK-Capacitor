import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, test } from 'node:test';

const { RevnixWeb } = await import('../dist/esm/web.js');

function configuredWeb() {
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
    },
  };
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true }), { status: 201 });
  return new RevnixWeb();
}

describe('native purchase + restore (Capacitor web)', () => {
  test('purchase and restore reject as mobile only before configure', async () => {
    const web = new RevnixWeb();
    await assert.rejects(() => web.purchase({ productId: 'pro_monthly' }), /mobile only/);
    await assert.rejects(() => web.restore(), /mobile only/);
  });

  test('purchase and restore still reject as mobile only after configure', async () => {
    const web = configuredWeb();
    await web.configure({ apiKey: 'rvx_pk_test', baseUrl: 'https://x.convex.site' });
    await assert.rejects(() => web.purchase({ productId: 'pro_monthly' }), /mobile only/);
    await assert.rejects(() => web.restore(), /mobile only/);
  });

  test('docs.json documents both methods', async () => {
    const docs = JSON.parse(await readFile(new URL('../dist/docs.json', import.meta.url), 'utf8'));
    const method = (name) => docs.api.methods.find((m) => m.name === name);
    assert.equal(
      method('purchase')?.signature,
      '(options: PurchaseOptions) => Promise<{ result: RegisterPurchaseResult | null; }>',
    );
    assert.equal(method('restore')?.signature, '() => Promise<{ restored: number; }>');
  });
});
