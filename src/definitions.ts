import type { PluginListenerHandle } from '@capacitor/core';

/** Wire-identical to the other Revnix SDKs (openapi.yaml is the source). */
export type RevnixStoreKind = 'apple' | 'google';

export interface ConfigureOptions {
  /**
   * Publishable key (`rvx_pk_live_…` / `rvx_pk_test_…`). The key fixes app +
   * environment server-side. Secret keys must never ship in a binary;
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
  /** StoreKit 2 JWS: the proof path, claims without it are provisional. */
  signedTransactionInfo?: string;
}

export interface RegisterPurchaseResult {
  eventId: string;
  /** Ledger position; pass to waitForEntitlements to unlock. */
  seq: number;
  duplicate: boolean;
  /** The id to use going forward. The SDK adopts it automatically. */
  customerId: string;
  transferred?: boolean;
  ownedByOtherCustomer?: boolean;
  refused?: string;
  restored?: boolean;
  /** Recorded without store proof: live but time-boxed until the store
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
  /** e.g. "Join 2M+ users"; small line under the CTA. */
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
 * Remote paywall design attached to a placement. Render contract: the app
 * draws this with its own components; prices still come from the store
 * (StoreKit / Play Billing) so the display never disagrees with the charge.
 */
export interface PaywallConfig {
  /** Layout: the screen structure to render. The dashboard's template
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
  /** A designed paywall: the block tree the dashboard's builder authored.
   *  When present `renderRevnixPaywall` renders THIS and the fields above act
   *  as the fallback for clients that predate block rendering — so an app on
   *  an older SDK keeps showing a sane classic screen instead of nothing.
   *  Typed as `PaywallBlockDoc` in the renderer; opaque here so a consumer
   *  that only reads the config pulls in no renderer types. */
  blocks?: unknown;
}

export interface PlacementPaywall {
  paywallId: string;
  name: string;
  config: PaywallConfig;
}

/** A/B experiment assignment (REV-219). The served `offering`/`paywall` are
 *  already the assigned variant's; this is attribution metadata, not
 *  something the app needs to branch on. */
export interface PlacementExperiment {
  key: string;
  variantId: string;
}

export interface PlacementResolution {
  status: string;
  placementKey: string;
  /** Published catalog revision this resolution came from. */
  revision: number;
  offering: PlacementOffering;
  /** Remote paywall render contract: your app renders it in v1. Absent when
   *  the placement has no paywall attached (the wire sends null; native
   *  bridges omit the key). */
  paywall?: PlacementPaywall;
  /** Sticky experiment assignment for this customer; `null` when no running
   *  experiment covers the placement (older servers omit the key, and every
   *  bridge normalizes that to null). */
  experiment: PlacementExperiment | null;
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
 * are never masked by a cache: a kill-switch must stay a kill-switch.
 */
export interface RevnixPlugin {
  /** Configure once at startup. Native platforms drain the purchase retry
   *  queue and report the install as launch chores (both idempotent), and
   *  start the store observer: iOS watches StoreKit 2 `Transaction.updates`
   *  (renewals, Ask to Buy approvals, refunds, purchases on another device),
   *  Android replays Play Billing purchases. Observed transactions are
   *  registered with proof and then finished/acknowledged by Revnix, so a
   *  purchase you also register from JS comes back `duplicate: true` — not
   *  an error. If another IAP plugin must finish iOS transactions itself,
   *  keep that in mind: Revnix finishes only after the claim is recorded or
   *  durably queued. Calling configure again retires the previous observer. */
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

  /** Gate helper; never rejects. Unknown or unreachable resolves false, so
   *  gates fail closed. */
  isEntitled(options: { entitlementId: string }): Promise<{ entitled: boolean }>;

  /** Read-your-writes: poll until the ledger reflects `seq`. Returns the
   *  last read (rather than rejecting) if the schedule runs out. */
  waitForEntitlements(options: { seq: number }): Promise<CustomerEntitlements>;

  /** Register a store purchase. On a transient failure the claim is queued
   *  durably and the call rejects; it is never lost. */
  registerPurchase(options: RegisterPurchaseInput): Promise<RegisterPurchaseResult>;

  /** Drain the persistent retry queue. Safe on every launch/foreground;
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
   *  visible, not when you start loading it.
   *
   *  Resolves with the view id the beacon generated (REV-252), or undefined on
   *  a host that predates close reporting. Hand that id to `logPaywallClosed`
   *  when the customer dismisses THIS display: the two events sharing one view
   *  id is what lets the ledger pair a close with the display it ended.
   *  `renderRevnixPaywall` does all of this for you. */
  logPaywallShown(options?: {
    placementKey?: string;
    paywallId?: string;
  }): Promise<{ viewId?: string }>;

  /** Fire-and-forget paywall dismissal (REV-252) — the other half of a
   *  display's life. Idempotent per view id, exactly like the impression.
   *  Pass the id `logPaywallShown` resolved with for this display. */
  logPaywallClosed(options: {
    viewId: string;
    placementKey?: string;
    paywallId?: string;
  }): Promise<void>;

  /** Set attributes on the current customer. Attributes are what A/B-test
   *  audiences target; set `country`, `app_version`, `locale`, or any custom
   *  key you want to segment on. `null` deletes a key.
   *
   *  Rejects, unlike the fire-and-forget beacons: the next placement resolve
   *  may depend on these. `email` and `username` are reserved (secret key
   *  only), and an attribute your backend already set cannot be changed from
   *  a device. */
  setAttributes(options: {
    attributes: Record<string, string | number | null>;
  }): Promise<void>;

  /** Background failures the SDK swallowed (queue drains, telemetry). */
  addListener(
    eventName: 'diagnostic',
    listenerFunc: (diagnostic: RevnixDiagnostic) => void,
  ): Promise<PluginListenerHandle>;

  removeAllListeners(): Promise<void>;
}
