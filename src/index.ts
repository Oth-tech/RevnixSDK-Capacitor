import { registerPlugin } from '@capacitor/core';

import type { RevnixPlugin } from './definitions';

/**
 * The Revnix plugin. iOS bridges `revnix-swift` (StoreKit 2), Android
 * bridges `revnix-kotlin` (Play Billing 8), web delegates to `revnix-react` —
 * one resilience policy, implemented once per platform.
 */
const Revnix = registerPlugin<RevnixPlugin>('Revnix', {
  web: () => import('./web').then((m) => new m.RevnixWeb()),
});

export * from './definitions';
export * from './ui';
export { Revnix };
