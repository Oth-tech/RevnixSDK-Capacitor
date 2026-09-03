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
// The designed-paywall renderer. `renderRevnixPaywall` uses it automatically
// when a config carries `blocks`; these are exported for hosts that render a
// block document themselves, and for `minorUnitsForCurrency`, which a host
// needs to convert a store price into the minor units the tags read.
export type {
  BlockBase,
  BlockPackage,
  BlockRenderContext,
  BlockScope,
  BlockStyle,
  BlockVisibility,
  ButtonBlock,
  CanvasMetrics,
  CardBlock,
  ImageBlock,
  LineBlock,
  LinksBlock,
  ListBlock,
  PaywallBlock,
  PaywallBlockDoc,
  ProductsBlock,
  SpacerBlock,
  TextBlock,
} from './blocks';
export {
  asBlockDoc,
  canvasMetrics,
  effectiveStyle,
  isVisible,
  minorUnitsForCurrency,
  renderBlockDoc,
  resolveSelectedContext,
  resolveTags,
} from './blocks';
export { Revnix };
