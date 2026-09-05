# Changelog

## Unreleased

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
