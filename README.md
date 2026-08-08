# revnix-capacitor

[Revnix](https://revnix.io) subscriptions and entitlements for Capacitor —
the same client contract as every Revnix SDK, one implementation per platform:

- **iOS** bridges [`revnix-swift`](https://github.com/Oth-tech/revnix-swift) (StoreKit 2)
- **Android** bridges [`revnix-kotlin`](https://github.com/Oth-tech/revnix-kotlin) (Play Billing 8)
- **Web** delegates to [`revnix-react`](https://www.npmjs.com/package/revnix-react) — the canonical TypeScript implementation of the resilience policy

> Until the native SDKs ship to CocoaPods/SPM and Maven Central, their 0.1.0
> sources are **vendored** inside this plugin (`ios/…/Revnix/`,
> `android/…/com/revnix/`) so it builds standalone. Fix native bugs upstream,
> then re-copy.

What every platform guarantees: network-first entitlements with an offline
cache flagged `stale`, deliberate rejections (401/403/404/409) never masked by
that cache, one fetch per screen of gates (soft TTL + coalescing), a durable
purchase retry queue drained idempotently on every launch, and read-your-writes
unlock via `waitForEntitlements(seq)`.

## Quick start

```ts
import { Revnix } from 'revnix-capacitor';

await Revnix.configure({
  apiKey: 'rvx_pk_live_…',                    // publishable key only
  baseUrl: 'https://your-deployment.convex.site',
});

// Gate. Never rejects; unknown or unreachable means locked.
const { entitled } = await Revnix.isEntitled({ entitlementId: 'pro' });

// Paywall
const placement = await Revnix.resolvePlacement({ placementKey: 'main_paywall' });
await Revnix.logPaywallShown({ placementKey: 'main_paywall' });

// After a store purchase completes (StoreKit 2 / Play Billing):
const result = await Revnix.registerPurchase({
  source: 'apple',
  token: originalTransactionId,
  productId,
  transactionId,
  signedTransactionInfo: jws,               // the proof path
});
await Revnix.waitForEntitlements({ seq: result.seq }); // read-your-writes unlock
```

## Install

To use npm

```bash
npm install revnix-capacitor
````

To use yarn

```bash
yarn add revnix-capacitor
```

Sync native files

```bash
npx cap sync
```

## API

<docgen-index>

* [`configure(...)`](#configure)
* [`getCustomerId()`](#getcustomerid)
* [`logout()`](#logout)
* [`getEntitlements()`](#getentitlements)
* [`getCachedEntitlements()`](#getcachedentitlements)
* [`isEntitled(...)`](#isentitled)
* [`waitForEntitlements(...)`](#waitforentitlements)
* [`registerPurchase(...)`](#registerpurchase)
* [`retryPendingPurchases()`](#retrypendingpurchases)
* [`pendingPurchaseCount()`](#pendingpurchasecount)
* [`resolvePlacement(...)`](#resolveplacement)
* [`registerInstall(...)`](#registerinstall)
* [`logPaywallShown(...)`](#logpaywallshown)
* [`addListener('diagnostic', ...)`](#addlistenerdiagnostic-)
* [`removeAllListeners()`](#removealllisteners)
* [Interfaces](#interfaces)
* [Type Aliases](#type-aliases)

</docgen-index>

<docgen-api>
<!--Update the source file JSDoc comments and rerun docgen to update the docs below-->

Failure taxonomy: rejected calls carry `code` (network · timeout ·
rate_limited · server · bad_response · auth · not_found · purchase_blocked
· invalid) and `data.isRetryable`. Deliberate rejections (401/403/404/409)
are never masked by a cache — a kill-switch must stay a kill-switch.

### configure(...)

```typescript
configure(options: ConfigureOptions) => Promise<void>
```

Configure once at startup. Native platforms drain the purchase retry
queue and report the install as launch chores (both idempotent).

| Param         | Type                                                          |
| ------------- | ------------------------------------------------------------- |
| **`options`** | <code><a href="#configureoptions">ConfigureOptions</a></code> |

--------------------


### getCustomerId()

```typescript
getCustomerId() => Promise<{ customerId: string; }>
```

Anonymous id, minted and persisted natively on first use.

**Returns:** <code>Promise&lt;{ customerId: string; }&gt;</code>

--------------------


### logout()

```typescript
logout() => Promise<{ customerId: string; }>
```

Mint a fresh anonymous identity. Call at sign-out, or the next user
inherits the previous one's cached entitlements.

**Returns:** <code>Promise&lt;{ customerId: string; }&gt;</code>

--------------------


### getEntitlements()

```typescript
getEntitlements() => Promise<CustomerEntitlements>
```

Network-first entitlement read. Transient failures serve the cache
flagged `stale`; deliberate rejections (401/403/404/409) reject.

**Returns:** <code>Promise&lt;<a href="#customerentitlements">CustomerEntitlements</a>&gt;</code>

--------------------


### getCachedEntitlements()

```typescript
getCachedEntitlements() => Promise<{ snapshot: CustomerEntitlements | null; }>
```

Last cached snapshot with the offline policy applied; `snapshot: null`
when this customer never had a live read. Never touches the network.

**Returns:** <code>Promise&lt;{ snapshot: <a href="#customerentitlements">CustomerEntitlements</a> | null; }&gt;</code>

--------------------


### isEntitled(...)

```typescript
isEntitled(options: { entitlementId: string; }) => Promise<{ entitled: boolean; }>
```

Gate helper — never rejects. Unknown or unreachable resolves false, so
gates fail closed.

| Param         | Type                                    |
| ------------- | --------------------------------------- |
| **`options`** | <code>{ entitlementId: string; }</code> |

**Returns:** <code>Promise&lt;{ entitled: boolean; }&gt;</code>

--------------------


### waitForEntitlements(...)

```typescript
waitForEntitlements(options: { seq: number; }) => Promise<CustomerEntitlements>
```

Read-your-writes: poll until the ledger reflects `seq`. Returns the
last read (rather than rejecting) if the schedule runs out.

| Param         | Type                          |
| ------------- | ----------------------------- |
| **`options`** | <code>{ seq: number; }</code> |

**Returns:** <code>Promise&lt;<a href="#customerentitlements">CustomerEntitlements</a>&gt;</code>

--------------------


### registerPurchase(...)

```typescript
registerPurchase(options: RegisterPurchaseInput) => Promise<RegisterPurchaseResult>
```

Register a store purchase. On a transient failure the claim is queued
durably and the call rejects — it is never lost.

| Param         | Type                                                                    |
| ------------- | ----------------------------------------------------------------------- |
| **`options`** | <code><a href="#registerpurchaseinput">RegisterPurchaseInput</a></code> |

**Returns:** <code>Promise&lt;<a href="#registerpurchaseresult">RegisterPurchaseResult</a>&gt;</code>

--------------------


### retryPendingPurchases()

```typescript
retryPendingPurchases() => Promise<{ delivered: number; }>
```

Drain the persistent retry queue. Safe on every launch/foreground —
the server dedupes on the purchase key. (Web reports `delivered: 0`;
revnix-react drains internally without a count.)

**Returns:** <code>Promise&lt;{ delivered: number; }&gt;</code>

--------------------


### pendingPurchaseCount()

```typescript
pendingPurchaseCount() => Promise<{ count: number; }>
```

How many registrations are still queued. (Web always reports 0.)

**Returns:** <code>Promise&lt;{ count: number; }&gt;</code>

--------------------


### resolvePlacement(...)

```typescript
resolvePlacement(options: { placementKey: string; }) => Promise<PlacementResolution>
```

Resolve a placement to its offering + remote paywall config, with an
offline fallback to the last successful resolution.

| Param         | Type                                   |
| ------------- | -------------------------------------- |
| **`options`** | <code>{ placementKey: string; }</code> |

**Returns:** <code>Promise&lt;<a href="#placementresolution">PlacementResolution</a>&gt;</code>

--------------------


### registerInstall(...)

```typescript
registerInstall(options?: { platform?: string | undefined; appVersion?: string | undefined; } | undefined) => Promise<void>
```

Fire-and-forget install beacon; recorded once per customer id. (Web:
handled automatically by configure.)

| Param         | Type                                                     |
| ------------- | -------------------------------------------------------- |
| **`options`** | <code>{ platform?: string; appVersion?: string; }</code> |

--------------------


### logPaywallShown(...)

```typescript
logPaywallShown(options?: { placementKey?: string | undefined; paywallId?: string | undefined; } | undefined) => Promise<void>
```

Fire-and-forget paywall impression. Call when the paywall becomes
visible, not when you start loading it.

| Param         | Type                                                        |
| ------------- | ----------------------------------------------------------- |
| **`options`** | <code>{ placementKey?: string; paywallId?: string; }</code> |

--------------------


### addListener('diagnostic', ...)

```typescript
addListener(eventName: 'diagnostic', listenerFunc: (diagnostic: RevnixDiagnostic) => void) => Promise<PluginListenerHandle>
```

Background failures the SDK swallowed (queue drains, telemetry).

| Param              | Type                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------- |
| **`eventName`**    | <code>'diagnostic'</code>                                                              |
| **`listenerFunc`** | <code>(diagnostic: <a href="#revnixdiagnostic">RevnixDiagnostic</a>) =&gt; void</code> |

**Returns:** <code>Promise&lt;<a href="#pluginlistenerhandle">PluginListenerHandle</a>&gt;</code>

--------------------


### removeAllListeners()

```typescript
removeAllListeners() => Promise<void>
```

--------------------


### Interfaces


#### ConfigureOptions

| Prop                       | Type                | Description                                                                                                                                                                                                          |
| -------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`apiKey`**               | <code>string</code> | Publishable key (`rvx_pk_live_…` / `rvx_pk_test_…`). The key fixes app + environment server-side. Secret keys must never ship in a binary — identify/alias are server-proxied by design and not part of this plugin. |
| **`baseUrl`**              | <code>string</code> | e.g. `https://your-deployment.convex.site`                                                                                                                                                                           |
| **`timeoutMs`**            | <code>number</code> | Per-request timeout in ms. Default 10 000.                                                                                                                                                                           |
| **`entitlementsTtlMs`**    | <code>number</code> | Soft TTL on entitlement reads in ms. Default 30 000; 0 = always fetch.                                                                                                                                               |
| **`offlineMaxCacheAgeMs`** | <code>number</code> | Snapshots older than this serve as all-inactive. Default 14 days.                                                                                                                                                    |


#### CustomerEntitlements

| Prop               | Type                       | Description                                            |
| ------------------ | -------------------------- | ------------------------------------------------------ |
| **`customerId`**   | <code>string</code>        |                                                        |
| **`cursor`**       | <code>number</code>        | Ledger position this read reflects (read-your-writes). |
| **`entitlements`** | <code>Entitlement[]</code> |                                                        |
| **`stale`**        | <code>boolean</code>       | True when served from the offline cache.               |
| **`fetchedAt`**    | <code>number</code>        | Unix ms this snapshot was fetched.                     |


#### Entitlement

| Prop                | Type                             | Description                                                     |
| ------------------- | -------------------------------- | --------------------------------------------------------------- |
| **`entitlementId`** | <code>string</code>              |                                                                 |
| **`isActive`**      | <code>boolean</code>             |                                                                 |
| **`expiresAt`**     | <code>number</code>              | Unix ms; absent for a lifetime purchase or an open-ended grant. |
| **`sources`**       | <code>EntitlementSource[]</code> |                                                                 |


#### EntitlementSource

| Prop            | Type                 |
| --------------- | -------------------- |
| **`kind`**      | <code>string</code>  |
| **`key`**       | <code>string</code>  |
| **`isActive`**  | <code>boolean</code> |
| **`expiresAt`** | <code>number</code>  |


#### RegisterPurchaseResult

| Prop                       | Type                 | Description                                                                                                        |
| -------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **`eventId`**              | <code>string</code>  |                                                                                                                    |
| **`seq`**                  | <code>number</code>  | Ledger position — pass to waitForEntitlements to unlock.                                                           |
| **`duplicate`**            | <code>boolean</code> |                                                                                                                    |
| **`customerId`**           | <code>string</code>  | The id to use going forward. The SDK adopts it automatically.                                                      |
| **`transferred`**          | <code>boolean</code> |                                                                                                                    |
| **`ownedByOtherCustomer`** | <code>boolean</code> |                                                                                                                    |
| **`refused`**              | <code>string</code>  |                                                                                                                    |
| **`restored`**             | <code>boolean</code> |                                                                                                                    |
| **`provisional`**          | <code>boolean</code> | Recorded without store proof — live but time-boxed until the store confirms. Expect true for Google device claims. |


#### RegisterPurchaseInput

| Prop                        | Type                                                        | Description                                                         |
| --------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------- |
| **`source`**                | <code><a href="#revnixstorekind">RevnixStoreKind</a></code> |                                                                     |
| **`token`**                 | <code>string</code>                                         | Apple: originalTransactionId · Google: purchaseToken.               |
| **`productId`**             | <code>string</code>                                         |                                                                     |
| **`transactionId`**         | <code>string</code>                                         | Google: this is the purchaseToken too (the established rule).       |
| **`occurredAt`**            | <code>number</code>                                         |                                                                     |
| **`expiresAt`**             | <code>number</code>                                         |                                                                     |
| **`signedTransactionInfo`** | <code>string</code>                                         | StoreKit 2 JWS — the proof path; claims without it are provisional. |


#### PlacementResolution

| Prop               | Type                                                             | Description                                                 |
| ------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| **`status`**       | <code>string</code>                                              |                                                             |
| **`placementKey`** | <code>string</code>                                              |                                                             |
| **`revision`**     | <code>number</code>                                              | Published catalog revision this resolution came from.       |
| **`offering`**     | <code><a href="#placementoffering">PlacementOffering</a></code>  |                                                             |
| **`paywall`**      | <code><a href="#record">Record</a>&lt;string, unknown&gt;</code> | Remote paywall render contract — your app renders it in v1. |


#### PlacementOffering

| Prop              | Type                            |
| ----------------- | ------------------------------- |
| **`offeringId`**  | <code>string</code>             |
| **`displayName`** | <code>string</code>             |
| **`packages`**    | <code>PlacementPackage[]</code> |


#### PlacementPackage

| Prop            | Type                |
| --------------- | ------------------- |
| **`packageId`** | <code>string</code> |
| **`productId`** | <code>string</code> |


#### PluginListenerHandle

| Prop         | Type                                      |
| ------------ | ----------------------------------------- |
| **`remove`** | <code>() =&gt; Promise&lt;void&gt;</code> |


#### RevnixDiagnostic

A background failure the SDK swallowed (queue drains, telemetry beacons).

| Prop          | Type                |
| ------------- | ------------------- |
| **`op`**      | <code>string</code> |
| **`message`** | <code>string</code> |


### Type Aliases


#### RevnixStoreKind

Wire-identical to the other Revnix SDKs (openapi.yaml is the source).

<code>'apple' | 'google'</code>


#### Record

Construct a type with a set of properties K of type T

<code>{ [P in K]: T; }</code>

</docgen-api>
