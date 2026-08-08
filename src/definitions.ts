import type { PluginListenerHandle } from '@capacitor/core';

/** Wire-identical to the other Revnix SDKs (openapi.yaml is the source). */
export type RevnixStoreKind = 'apple' | 'google';

export interface ConfigureOptions {
  /**
   * Publishable key (`rvx_pk_live_…` / `rvx_pk_test_…`). The key fixes app +
   * environment server-side. Secret keys must never ship in a binary —
   * identify/alias are server-proxied by design and not part of this plugin.
   */
  apiKey: string;
  /** e.g. `https://your-deployment.convex.site` */
  baseUrl: string;
  /** Per-request timeout in ms. Default 10 000. */
  timeoutMs?: number;
  /** Soft TTL on entitlement reads in ms. Default 30 000; 0 = always fetch. */
  entitlementsTtlMs?: number;
  /** Snapshots older than this serve as all-inactive. Default 14 days. */
  offlineMaxCacheAgeMs?: number;
}

export interface EntitlementSource {
  kind: string;
  key: string;
  isActive: boolean;
  expiresAt?: number;
}

export interface Entitlement {
  entitlementId: string;
  isActive: boolean;
  /** Unix ms; absent for a lifetime purchase or an open-ended grant. */
  expiresAt?: number;
  sources: EntitlementSource[];
}

export interface CustomerEntitlements {
  customerId: string;
  /** Ledger position this read reflects (read-your-writes). */
  cursor: number;
  entitlements: Entitlement[];
  /** True when served from the offline cache. */
  stale?: boolean;
  /** Unix ms this snapshot was fetched. */
  fetchedAt?: number;
}

export interface RegisterPurchaseInput {
  source: RevnixStoreKind;
  /** Apple: originalTransactionId · Google: purchaseToken. */
  token: string;
  productId: string;
  /** Google: this is the purchaseToken too (the established rule). */
  transactionId: string;
  occurredAt?: number;
  expiresAt?: number;
  /** StoreKit 2 JWS — the proof path; claims without it are provisional. */
  signedTransactionInfo?: string;
}

export interface RegisterPurchaseResult {
  eventId: string;
  /** Ledger position — pass to waitForEntitlements to unlock. */
  seq: number;
  duplicate: boolean;
  /** The id to use going forward. The SDK adopts it automatically. */
  customerId: string;
  transferred?: boolean;
  ownedByOtherCustomer?: boolean;
  refused?: string;
  restored?: boolean;
  /** Recorded without store proof — live but time-boxed until the store
   *  confirms. Expect true for Google device claims. */
  provisional?: boolean;
}

export interface PlacementPackage {
  packageId: string;
  productId: string;
}

export interface PlacementOffering {
  offeringId: string;
  displayName: string;
  packages: PlacementPackage[];
}

export interface PaywallFeature {
  icon?: string;
  title: string;
  description?: string;
}

/** Social proof, dashboard-configured. Any layout renders the pieces that
 *  are set: stars/quote card above the packages, `count` under the CTA. */
export interface PaywallReview {
  /** 0–5; rendered as a star row. */
  rating?: number;
  quote?: string;
  author?: string;
  /** e.g. "Join 2M+ users" — small line under the CTA. */
  count?: string;
}

/** Win-back/offer presentation: anchor price struck through on the
 *  highlighted package, urgency line above the CTA. Any layout. */
export interface PaywallOffer {
  strikethroughPrice?: string;
  urgencyText?: string;
}

/** Footer links, dashboard-configured. Absent (legacy config) = show all
 *  three. When a URL is set open it directly; otherwise run your own
 *  terms/privacy handler. */
export interface PaywallFooter {
  showRestore: boolean;
  showTerms: boolean;
  showPrivacy: boolean;
  termsUrl?: string;
  privacyUrl?: string;
}

/**
 * Remote paywall design attached to a placement. Render contract — the app
 * draws this with its own components; prices still come from the store
 * (StoreKit / Play Billing) so the display never disagrees with the charge.
 */
export interface PaywallConfig {
  /** Layout — the screen structure to render. The dashboard's template
   *  gallery is presets over these layouts; the first three are the
   *  original templates and render exactly as before. */
  template: 'focus' | 'feature-list' | 'minimal' | 'hero' | 'timeline' | 'plans' | 'feature-grid' | 'offer' | 'reveal';
  /** Color scheme the paywall renders in. Absent (legacy config) = dark. */
  mode?: 'dark' | 'light';
  headline: string;
  subheadline?: string;
  features: PaywallFeature[];
  ctaLabel: string;
  /** packageId of the visually highlighted package. */
  highlightPackageId?: string;
  /** Badge on the highlighted package, e.g. "SAVE 17%". */
  badgeText?: string;
  /** Accent hex like "#6478ff"; fall back to the app theme when absent. */
  accent?: string;
  /** Hero image URL rendered above the headline in place of the icon tile. */
  heroImageUrl?: string;
  review?: PaywallReview;
  offer?: PaywallOffer;
  footer?: PaywallFooter;
}

export interface PlacementPaywall {
  paywallId: string;
  name: string;
  config: PaywallConfig;
}

export interface PlacementResolution {
  status: string;
  placementKey: string;
  /** Published catalog revision this resolution came from. */
  revision: number;
  offering: PlacementOffering;
  /** Remote paywall render contract — your app renders it in v1. Absent when
   *  the placement has no paywall attached (the wire sends null; native
   *  bridges omit the key). */
  paywall?: PlacementPaywall;
}

/** A background failure the SDK swallowed (queue drains, telemetry beacons). */
export interface RevnixDiagnostic {
  op: string;
  message: string;
}

/**
 * Failure taxonomy: rejected calls carry `code` (network · timeout ·
 * rate_limited · server · bad_response · auth · not_found · purchase_blocked
 * · invalid) and `data.isRetryable`. Deliberate rejections (401/403/404/409)
 * are never masked by a cache — a kill-switch must stay a kill-switch.
 */
export interface RevnixPlugin {
  /** Configure once at startup. Native platforms drain the purchase retry
   *  queue and report the install as launch chores (both idempotent). */
  configure(options: ConfigureOptions): Promise<void>;

  /** Anonymous id, minted and persisted natively on first use. */
  getCustomerId(): Promise<{ customerId: string }>;

  /** Mint a fresh anonymous identity. Call at sign-out, or the next user
   *  inherits the previous one's cached entitlements. */
  logout(): Promise<{ customerId: string }>;

  /** Network-first entitlement read. Transient failures serve the cache
   *  flagged `stale`; deliberate rejections (401/403/404/409) reject. */
  getEntitlements(): Promise<CustomerEntitlements>;

  /** Last cached snapshot with the offline policy applied; `snapshot: null`
   *  when this customer never had a live read. Never touches the network. */
  getCachedEntitlements(): Promise<{ snapshot: CustomerEntitlements | null }>;

  /** Gate helper — never rejects. Unknown or unreachable resolves false, so
   *  gates fail closed. */
  isEntitled(options: { entitlementId: string }): Promise<{ entitled: boolean }>;

  /** Read-your-writes: poll until the ledger reflects `seq`. Returns the
   *  last read (rather than rejecting) if the schedule runs out. */
  waitForEntitlements(options: { seq: number }): Promise<CustomerEntitlements>;

  /** Register a store purchase. On a transient failure the claim is queued
   *  durably and the call rejects — it is never lost. */
  registerPurchase(options: RegisterPurchaseInput): Promise<RegisterPurchaseResult>;

  /** Drain the persistent retry queue. Safe on every launch/foreground —
   *  the server dedupes on the purchase key. (Web reports `delivered: 0`;
   *  revnix-react drains internally without a count.) */
  retryPendingPurchases(): Promise<{ delivered: number }>;

  /** How many registrations are still queued. (Web always reports 0.) */
  pendingPurchaseCount(): Promise<{ count: number }>;

  /** Resolve a placement to its offering + remote paywall config, with an
   *  offline fallback to the last successful resolution. */
  resolvePlacement(options: { placementKey: string }): Promise<PlacementResolution>;

  /** Fire-and-forget install beacon; recorded once per customer id. (Web:
   *  handled automatically by configure.) */
  registerInstall(options?: { platform?: string; appVersion?: string }): Promise<void>;

  /** Fire-and-forget paywall impression. Call when the paywall becomes
   *  visible, not when you start loading it. */
  logPaywallShown(options?: { placementKey?: string; paywallId?: string }): Promise<void>;

  /** Background failures the SDK swallowed (queue drains, telemetry). */
  addListener(
    eventName: 'diagnostic',
    listenerFunc: (diagnostic: RevnixDiagnostic) => void,
  ): Promise<PluginListenerHandle>;

  removeAllListeners(): Promise<void>;
}
