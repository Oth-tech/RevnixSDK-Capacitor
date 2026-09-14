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
  /**
   * REV-268: overrides for the device facts sent with every placement
   * resolve, so targeting rules ("US storefront", "app version at least 3")
   * can be evaluated on the request that serves the paywall. The native SDKs
   * detect platform, OS version, app version, locale, currency, model and the
   * sandbox flag themselves (the web build detects what a browser exposes);
   * pass only what you know better. Stored on the customer as reserved
   * `device.*` attributes, visible in the dashboard.
   */
  device?: DeviceFacts;
  /**
   * REV-272: turn on implicit placements — the six moments the SDK reports on
   * its own (`app_install`, `app_launch`, `session_start`, `deeplink_open`,
   * `paywall_decline`, `transaction_abandon`). With this on, the SDK asks
   * `GET /v1/config` once and then fires only for the moments this app has
   * configured in the dashboard, emitting each one that resolves to a paywall
   * as an `implicitPaywall` event.
   *
   * Off by default: without a listener there is nothing to do with the answer.
   */
  implicitPlacements?: boolean;
  /**
   * REV-272: how long the app must have been backgrounded for the return to
   * count as a new session rather than an app switch. Default 30 minutes.
   */
  sessionTimeoutMs?: number;
}

/** REV-272: which of the six implicit moments fired. Lowercase throughout —
 *  `deeplink_open`, not Superwall's `deepLink_open`, because a placement key
 *  must match `^[a-z0-9][a-z0-9._-]{0,63}$` server-side. */
export type ImplicitPlacement =
  | 'app_install'
  | 'app_launch'
  | 'session_start'
  | 'deeplink_open'
  | 'paywall_decline'
  | 'transaction_abandon';

/** REV-272: one implicit moment that resolved to a paywall. Only ever
 *  delivered WITH a paywall — a moment the server answered with none (nothing
 *  attached, or the same paywall the customer is leaving) is reported and
 *  then dropped, since there is nothing to present. */
export interface ImplicitTrigger {
  /** Which of the six fired. */
  placement: ImplicitPlacement;
  /** The resolution, exactly as `resolvePlacement` would have returned it. */
  resolution: PlacementResolution;
}

/** REV-268: the app-suppliable half of the device attribute contract. Every
 *  field is optional; the server normalizes case, locale separators and
 *  alpha-3 storefronts. */
export interface DeviceFacts {
  /** "ios", "android", "web", … — lowercase family name. */
  platform?: string;
  /** e.g. "18.1". */
  osVersion?: string;
  /** The host app's version, e.g. "1.2.10". */
  appVersion?: string;
  /** "en-US" or "en_US". */
  locale?: string;
  /** ISO 4217, e.g. "USD". */
  currency?: string;
  /** Store country — alpha-2 ("US") or alpha-3 ("USA"). */
  storefront?: string;
  /** Hardware model identifier. */
  model?: string;
  /** True in a sandbox / debug build. */
  sandbox?: boolean;
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
  /** Set only on a dashboard QR preview. */
  preview?: boolean;
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
/** REV-263: the six paywall interactions `logPaywallEvent` can report — what
 *  the customer did on a display, between the view that opened it and the
 *  close or purchase that ended it. The server turns each into the ledger type
 *  `paywall.<name>`. */
export type RevnixPaywallEvent =
  | 'selected'
  | 'purchase_started'
  | 'purchase_abandoned'
  | 'purchase_failed'
  | 'restore'
  | 'error';

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
   *  Pass the id `logPaywallShown` resolved with for this display.
   *
   *  A close is a DECLINE. Do not report one for a display that ended in a
   *  purchase — with implicit placements on, a close is also the
   *  `paywall_decline` moment, and a win-back offer seconds after a successful
   *  purchase is the one thing an operator never means. */
  logPaywallClosed(options: {
    viewId: string;
    placementKey?: string;
    paywallId?: string;
  }): Promise<void>;

  /** Report one of the six paywall interactions (REV-263) — what the customer
   *  DID on a display, between the `logPaywallShown` that opened it and the
   *  `logPaywallClosed` (or purchase) that ended it.
   *
   *  Fire-and-forget like the other beacons.
   *
   *  `viewId` is the id `logPaywallShown` resolved with for THIS display.
   *  Passing it is what threads the whole life of one impression together and
   *  puts the event on the paywall's own analytics row.
   *
   *  `renderRevnixPaywall` reports `selected`, `purchase_started`, `restore`
   *  and a no-products `error` for you. The purchase OUTCOME is yours: only
   *  your app performs the store call, so report `purchase_abandoned` /
   *  `purchase_failed` from your own purchase error handling.
   *
   *  `eventId` is the idempotency key and defaults to `viewId`, which caps the
   *  report at one per display per event. Pass one per occurrence — and reuse
   *  it across your own retries — to record each occurrence. */
  logPaywallEvent(options: {
    event: RevnixPaywallEvent;
    viewId: string;
    placementKey?: string;
    paywallId?: string;
    productId?: string;
    /** Store error code — `purchase_failed` / `error`. */
    code?: string;
    message?: string;
    eventId?: string;
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

  /** REV-272: hand the SDK the URL that opened your app, from wherever you
   *  already receive it (Capacitor's own `appUrlOpen` listener, your router).
   *
   *  This is the one implicit moment the SDK cannot see for itself — the URL
   *  reaches the host's entry point, and an SDK intercepting it would be
   *  fighting the app's routing. Does nothing unless `deeplink_open` is
   *  configured in the dashboard. */
  handleDeepLink(options: { url: string }): Promise<void>;

  /** Background failures the SDK swallowed (queue drains, telemetry). */
  addListener(
    eventName: 'diagnostic',
    listenerFunc: (diagnostic: RevnixDiagnostic) => void,
  ): Promise<PluginListenerHandle>;

  /** REV-272: one of the six implicit moments resolved to a paywall. Present
   *  it however your app presents paywalls; the plugin deliberately does not
   *  present for you, because it does not own your routing and a paywall
   *  thrown over a splash view is worse than no paywall.
   *
   *  Requires `implicitPlacements: true` in configure().
   *
   *  ⚠️ Pass `trigger.resolution.placementKey` to `logPaywallShown` for the
   *  display you present. That is what tells the SDK this display came FROM an
   *  implicit trigger, and it is the only thing that stops a `paywall_decline`
   *  paywall from firing `paywall_decline` again when the customer dismisses
   *  it — a loop with no way out but force-quitting. The server refuses to
   *  serve back the very same paywall as a backstop, but it cannot see a rule
   *  that points at a DIFFERENT paywall which points back. */
  addListener(
    eventName: 'implicitPaywall',
    listenerFunc: (trigger: ImplicitTrigger) => void,
  ): Promise<PluginListenerHandle>;

  removeAllListeners(): Promise<void>;
}
