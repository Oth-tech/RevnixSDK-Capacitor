import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

const { RevnixWeb } = await import('../dist/esm/web.js');

const KEYS = [
  'app_install',
  'app_launch',
  'session_start',
  'deeplink_open',
  'paywall_decline',
  'transaction_abandon',
];

/** A localStorage + fetch stand-in, recording what the client asked for. */
function harness({ configured = [], paywall = { paywallId: 'pw_x', name: 'X', config: {} } } = {}) {
  const store = new Map();
  globalThis.window = { localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  } };
  const calls = [];
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ path, body });
    if (path === '/v1/config') {
      return new Response(JSON.stringify({ revision: 1, implicitPlacements: configured }), { status: 200 });
    }
    if (path === '/v1/placements/triggered') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          placementKey: 'app_launch',
          revision: 1,
          offering: { offeringId: 'default', displayName: 'Default', packages: [] },
          paywall,
          experiment: null,
          skipReason: null,
          recorded: true,
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ ok: true }), { status: 201 });
  };
  return { calls };
}

/** Let the client's fire-and-forget launch work settle. */
async function settle() {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
}

function plugin() {
  const emitted = [];
  const web = new RevnixWeb();
  web.notifyListeners = (event, data) => emitted.push({ event, data });
  return { web, emitted };
}

const triggers = (calls) => calls.filter((c) => c.path === '/v1/placements/triggered');

describe('REV-272 implicit placements (Capacitor web)', () => {
  test('off by default — not even a /v1/config read', async () => {
    const { calls } = harness({ configured: ['app_launch'] });
    const { web } = plugin();
    await web.configure({ apiKey: 'rvx_pk_test', baseUrl: 'https://x.convex.site' });
    await settle();
    assert.equal(calls.filter((c) => c.path === '/v1/config').length, 0);
    assert.equal(triggers(calls).length, 0);
  });

  test('the option turns it on and the launch moments fire', async () => {
    const { calls } = harness({ configured: ['app_launch', 'session_start'] });
    const { web } = plugin();
    await web.configure({
      apiKey: 'rvx_pk_test',
      baseUrl: 'https://x.convex.site',
      implicitPlacements: true,
    });
    await settle();
    assert.equal(calls.filter((c) => c.path === '/v1/config').length, 1);
    assert.deepEqual(
      triggers(calls).map((c) => c.body.placement),
      ['app_launch', 'session_start'],
    );
  });

  test('a resolved paywall is emitted as an implicitPaywall event', async () => {
    harness({ configured: ['app_launch'] });
    const { web, emitted } = plugin();
    await web.configure({
      apiKey: 'rvx_pk_test',
      baseUrl: 'https://x.convex.site',
      implicitPlacements: true,
    });
    await settle();

    const event = emitted.find((e) => e.event === 'implicitPaywall');
    assert.ok(event, 'expected an implicitPaywall event');
    assert.equal(event.data.placement, 'app_launch');
    assert.equal(event.data.resolution.paywall.paywallId, 'pw_x');
  });

  test('an app that configured nothing asks once and then stays silent', async () => {
    const { calls } = harness({ configured: [] });
    const { web } = plugin();
    await web.configure({
      apiKey: 'rvx_pk_test',
      baseUrl: 'https://x.convex.site',
      implicitPlacements: true,
    });
    await settle();
    await web.handleDeepLink({ url: 'https://example.com/promo' });
    await settle();

    // /v1/installs is the launch chore every Capacitor app already makes; what
    // must not appear is a second /v1/config or a trigger that resolves a
    // paywall. The deep link still files its own attribution, report-only.
    assert.equal(calls.filter((c) => c.path === '/v1/config').length, 1);
    assert.deepEqual(
      triggers(calls).map((c) => c.body.resolve),
      [false],
    );
  });

  test('handleDeepLink fires the one moment no SDK can see for itself', async () => {
    const { calls } = harness({ configured: ['deeplink_open'] });
    const { web } = plugin();
    await web.configure({
      apiKey: 'rvx_pk_test',
      baseUrl: 'https://x.convex.site',
      implicitPlacements: true,
    });
    await settle();
    await web.handleDeepLink({ url: 'https://example.com/promo?ref=ad' });
    await settle();

    const trigger = triggers(calls).at(-1);
    assert.equal(trigger.body.placement, 'deeplink_open');
    assert.equal(trigger.body.url, 'https://example.com/promo?ref=ad');
  });

  test('the wire keys are the ones the server accepts', async () => {
    // The server 400s a key it does not know, and the failure is silent from
    // the app's side. `deeplink_open` is lowercase because a placement key must
    // match ^[a-z0-9][a-z0-9._-]{0,63}$ — Superwall's `deepLink_open` could
    // never be stored as a placement.
    const pattern = /^[a-z0-9][a-z0-9._-]{0,63}$/;
    for (const key of KEYS) assert.ok(pattern.test(key), `${key} would be refused`);
    assert.ok(!pattern.test('deepLink_open'));
  });
});
