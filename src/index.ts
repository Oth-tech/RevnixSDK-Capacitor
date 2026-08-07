import { registerPlugin } from '@capacitor/core';

import type { RevnixPlugin } from './definitions';

const Revnix = registerPlugin<RevnixPlugin>('Revnix', {
  web: () => import('./web').then((m) => new m.RevnixWeb()),
});

export * from './definitions';
export { Revnix };
