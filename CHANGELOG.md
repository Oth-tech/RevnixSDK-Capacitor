# Changelog

## Unreleased

### Added

- **App Tracking Transparency.** `requestTrackingAuthorization()` shows
  Apple's ATT prompt and resolves `{ status }` (0–3, -1 on Android and web);
  the answer and, when authorized, the IDFA are stored on the customer.
  `configure({ attWaitTimeoutMs })` holds the first install report until the
  prompt is answered. (TP3)

- **Custom events.** `track({ event, properties?, eventId? })` reports a
  custom in-app event to the ledger as `custom.<event>`. Fire-and-forget,
  like `logAdRevenue`. Not for purchases. (MS8)

- **Install attribution.** `getAttribution()` reads back the install-
  attribution verdict (`referrer`/`click`/`impression`/`organic`, link and
  UTM fields) the native SDK holds for this customer; the `attribution`
  listener delivers it as soon as the native SDK sees a verdict after
  cold-start install registration, and again whenever it changes.
  The native SDK fetches the verdict on its own once after the install is
  first reported; `getAttribution()` costs one GET per call. Always `null`
  on web. (AT11)

- **Ad revenue.** `logAdRevenue({ revenue, currency, ... })` reports an
  impression-level ad payout from your mediation SDK's paid-event callback
  (AdMob paid event, AppLovin MAX ad revenue paid). Fire-and-forget. (PT8)

- **Attribution import.** `setAttribution({ provider, network, ... })` hands
  the SDK an attribution verdict your MMP (Adjust, AppsFlyer, …) already
  reached, from that MMP's own callback. Fire-and-forget. (PT11)

- Android: `configure()` now reads the Play Install Referrer itself, once per
  install (adds `com.android.installreferrer:installreferrer:2.2`);
  `handleInstallReferrer` is only needed for referrers read another way. (AT7)

## 1.2.3 (2026-09-22)

### Changed

- Native SDKs: RevnixSDK-iOS 7e861d6 → 09c6ca6, RevnixSDK-Android 893b3db → 91eeb99.
- Web: revnix-react ^1.1.2 → ^1.2.3.

## 1.2.2 (2026-09-19)

### Added

- **Deferred deep links.** The `deferredDeepLink` listener event fires at
  most once per install with the link a customer clicked before installing —
  `exact` on Android (from `handleInstallReferrer`), `probabilistic` on iOS
  (matched by the server on install). `handleInstallReferrer({ referrer })`
  hands the raw Play Install Referrer string to the native Android SDK; a
  no-op on iOS and web. (REV-299)
- **`resolveDeepLink`.** Unwrap a link an email service provider wrapped in
  its own click-tracking domain back to the app deep link it redirects to.
  Never rejects; a link that cannot be resolved comes back unchanged. (REV-299)
- **`getLastDeepLink`.** Read back the most recent deep link the native SDK
  recorded: a link passed to `handleDeepLink`, or a delivered deferred deep
  link, whichever came last. Dashboard preview links are never recorded.
  `null` before any link, and always `null` on web for now.

## 1.1.2 (2026-09-14)

### Added

- **On-device QR paywall preview.** `PREVIEW_PLACEMENT_KEY` (`revnix_preview`)
  and `PlacementResolution.preview` identify a paywall opened from the
  dashboard's QR preview via `handleDeepLink`; `renderRevnixPaywall` disables
  purchases and view/close analytics for that placement. The native side of
  this (recognising the deep link, fetching the preview, suppressing its own
  analytics) ships in this release with the native pin move below.

### Changed

- Native SDKs: RevnixSDK-iOS f7d57f5 → 213cf2f, RevnixSDK-Android d194a9c → 3d9799e.
- Web: revnix-react ^1.1.1 → ^1.1.2.

## 1.1.1 (2026-09-12)

### Added

- **Device attribute contract.** Every `resolvePlacement` now carries the
  device facts — platform, OS version, app version, locale, currency,
  storefront, model, install date, SDK version, sandbox, first open — as
  `X-Revnix-Device`, so targeting rules and audiences can use them from the
  first launch and the dashboard shows them on the customer as `device.*`
  attributes. The native SDKs detect them; the web build detects what a
  browser exposes. `configure({ device: { … } })` overrides individual keys.
  Requires the revnix-react release that carries the contract, and the
  native submodules moved to it. (REV-268)

### Changed

- Native SDKs: RevnixSDK-iOS ca7b282 → f7d57f5, RevnixSDK-Android 5761f2c → d194a9c.

## 1.1.0 (2026-09-05)

### Added

- **`logPaywallEvent` — the six paywall interactions** (`selected`,
  `purchase_started`, `purchase_abandoned`, `purchase_failed`, `restore`,
  `error`), i.e. what the customer did BETWEEN the display and the close. The
  paywall view sends all but the purchase outcome, which only your app can see.
  All six are pure history: over-reporting skews a report, it never grants or
  revokes access. Pass the `viewId` `logPaywallShown` resolved with, so the
  whole life of one impression threads together.
- **The selected plan is drawn from the design.** Every block carries
  `selectedStyle` and `visibility`, so a plan card can change its fill, border
  and text when its package is the selected one, and a block can be drawn only
  while selected (a filled radio dot) or only while not.
- **iOS starts the StoreKit 2 observer in `configure`.** Renewals, Ask to
  Buy approvals, refunds, and purchases made on another device now reach
  Revnix on Capacitor iOS, as they already did on Flutter and Android. The
  observer registers each transaction with its JWS and finishes it once the
  claim is recorded or durably queued; a purchase you also register from JS
  simply returns `duplicate: true`. A second `configure` retires the
  previous observer (Android now retires its Play Billing connector the same
  way).
- `renderRevnixPaywall(container, options)` (REV-226) — framework-free DOM
  paywall renderer, ported 1:1 from revnix-react's `RevnixPaywall` (all nine
  template layouts, dark/light modes, anchor-price currency guard, one
  `paywall.viewed` report per render-mount via the plugin). Returns a handle
  with `update(partialOptions)` / `destroy()`. Designed (block) paywalls,
  backgrounds, plan selection, close, and gradient fills followed in the same
  renderer.

### Changed

- The native SDKs are git submodules (`ios/Revnix` → RevnixSDK-iOS,
  `android/revnix-kotlin` → RevnixSDK-Android) instead of vendored copies,
  which had already drifted from upstream. Clone with
  `--recurse-submodules`. Both bridges now forward the placement's `paywall`
  and `experiment` as the raw wire values (upstream `paywallJSON` /
  `paywallJson`), so a designed paywall from a newer dashboard reaches JS
  untouched.
- **iOS deployment target is 16.0** (was 15.0), revnix-swift's floor.
- Native SDKs: RevnixSDK-iOS 3a2cab2 → 9b43d10, RevnixSDK-Android be5b5c2 → d5ad877.
- Web: revnix-react ^0.12.0 → ^1.1.0.

## 0.2.0

A/B experiments (REV-219) — parity with revnix-swift 0.2.0 and
revnix-kotlin 0.2.0.

- `resolvePlacement` now sends the current customer id
  (`?customer=…`, URL-encoded) so a running experiment on the placement can
  assign a sticky variant; servers without experiments ignore the parameter
- `PlacementResolution.experiment` — the assignment as
  `{ key, variantId }`, or `null` when no running experiment covers the
  placement (older servers omit the field; every bridge normalizes to null).
  The served offering/paywall are already the variant's — attribution
  metadata only, nothing to branch on
- Vendored native cores bumped to the 0.2.0 sources; web appends the
  parameter itself (revnix-react gained its own experiment support in 0.14.0)
- `setAttributes({ attributes })` (REV-033) — the write half of audience
  targeting: sets string/number attributes on the current customer, `null`
  deletes a key. Rejects rather than firing and forgetting, since the next
  `resolvePlacement` may depend on it. `email`/`username` are reserved
  (secret key only) and a server-set attribute cannot be changed from a
  device; both reject the whole batch

## 0.1.0

Initial release — client-contract parity with revnix-swift 0.1.0,
revnix-kotlin 0.1.0, revnix_flutter 0.1.0, and com.revnix.sdk (Unity) 0.1.0.

- `configure` + launch chores (retry-queue drain, install beacon)
- Entitlements: `getEntitlements` (network-first, offline cache with `stale`,
  soft TTL, coalescing, clock-rollback defense), `getCachedEntitlements`,
  fail-closed `isEntitled`, read-your-writes `waitForEntitlements`
- Purchases: `registerPurchase` (StoreKit 2 JWS proof path on iOS,
  purchase-token claims on Android) with durable retry queue
  (`retryPendingPurchases`, `pendingPurchaseCount`); Play Billing
  acknowledgement ordering lives in the native connector
- Placements: `resolvePlacement` with offline fallback; `logPaywallShown`,
  `registerInstall` beacons
- `diagnostic` listener for swallowed background failures
- Typed rejection taxonomy: `code` + `data.isRetryable` on every failure
- Web implementation delegates to `revnix-react` (no policy reimplementation)
