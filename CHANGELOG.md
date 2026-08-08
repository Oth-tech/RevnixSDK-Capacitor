# Changelog

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
