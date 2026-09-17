import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

const { RevnixWeb } = await import('../dist/esm/web.js');

function configured() {
  const web = new RevnixWeb();
  web.credentials = { apiKey: 'rvx_pk_test', baseUrl: 'https://x.convex.site' };
  return web;
}

describe('REV-299 resolveDeepLink (Capacitor web)', () => {
  test('returns the resolved url and calls the resolve endpoint', async () => {
    const web = configured();
    const calls = [];
    globalThis.fetch = async (input) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ url: 'com.voigu.app://promo?utm_source=email' }), {
        status: 200,
      });
    };
    const wrapped = 'https://click.mailchimp.com/track/abc';
    const result = await web.resolveDeepLink({ url: wrapped });
    assert.deepEqual(result, { url: 'com.voigu.app://promo?utm_source=email' });
    assert.equal(calls.length, 1);
    assert.match(calls[0], /\/v1\/links\/resolve\?url=/);
    assert.ok(calls[0].includes(encodeURIComponent(wrapped)));
  });

  test('fetch failure returns the input url unchanged, never rejects', async () => {
    const web = configured();
    globalThis.fetch = async () => {
      throw new Error('network down');
    };
    const result = await web.resolveDeepLink({ url: 'https://click.mailchimp.com/track/abc' });
    assert.deepEqual(result, { url: 'https://click.mailchimp.com/track/abc' });
  });

  test('an app-scheme url is returned unchanged, no fetch', async () => {
    const web = configured();
    let called = false;
    globalThis.fetch = async () => {
      called = true;
      return new Response('{}', { status: 200 });
    };
    const input = 'com.voigu.app://promo?utm_source=email';
    const result = await web.resolveDeepLink({ url: input });
    assert.deepEqual(result, { url: input });
    assert.equal(called, false);
  });

  test('a url over 1024 chars is returned unchanged, no fetch', async () => {
    const web = configured();
    let called = false;
    globalThis.fetch = async () => {
      called = true;
      return new Response('{}', { status: 200 });
    };
    const input = `https://click.mailchimp.com/track/${'a'.repeat(1025 - 'https://click.mailchimp.com/track/'.length)}`;
    assert.equal(input.length, 1025);
    const result = await web.resolveDeepLink({ url: input });
    assert.deepEqual(result, { url: input });
    assert.equal(called, false);
  });

  test('rejects with the configure error before configure', async () => {
    const web = new RevnixWeb();
    await assert.rejects(
      () => web.resolveDeepLink({ url: 'https://click.mailchimp.com/track/abc' }),
      /configure/,
    );
  });
});
