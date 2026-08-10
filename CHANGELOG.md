# Changelog

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
