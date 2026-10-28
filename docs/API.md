<docgen-index>

* [`configure(...)`](#configure)
* [`getCustomerId()`](#getcustomerid)
* [`logout()`](#logout)
* [`identify(...)`](#identify)
* [`getEntitlements()`](#getentitlements)
* [`getCachedEntitlements()`](#getcachedentitlements)
* [`isEntitled(...)`](#isentitled)
* [`waitForEntitlements(...)`](#waitforentitlements)
* [`registerPurchase(...)`](#registerpurchase)
* [`purchase(...)`](#purchase)
* [`restore()`](#restore)
* [`retryPendingPurchases()`](#retrypendingpurchases)
* [`pendingPurchaseCount()`](#pendingpurchasecount)
* [`resolvePlacement(...)`](#resolveplacement)
* [`registerInstall(...)`](#registerinstall)
* [`updateSkanConversionValue(...)`](#updateskanconversionvalue)
* [`logPaywallShown(...)`](#logpaywallshown)
* [`logPaywallClosed(...)`](#logpaywallclosed)
* [`logPaywallEvent(...)`](#logpaywallevent)
* [`logAdRevenue(...)`](#logadrevenue)
* [`track(...)`](#track)
* [`flushEvents()`](#flushevents)
* [`preload(...)`](#preload)
* [`setAttribution(...)`](#setattribution)
* [`setPushToken(...)`](#setpushtoken)
* [`requestTrackingAuthorization()`](#requesttrackingauthorization)
* [`setAttributes(...)`](#setattributes)
* [`handleDeepLink(...)`](#handledeeplink)
* [`resolveDeepLink(...)`](#resolvedeeplink)
* [`getLastDeepLink()`](#getlastdeeplink)
* [`getAttribution()`](#getattribution)
* [`handleInstallReferrer(...)`](#handleinstallreferrer)
* [`addListener('diagnostic', ...)`](#addlistenerdiagnostic-)
* [`addListener('implicitPaywall', ...)`](#addlistenerimplicitpaywall-)
* [`addListener('deferredDeepLink', ...)`](#addlistenerdeferreddeeplink-)
* [`addListener('attribution', ...)`](#addlistenerattribution-)
* [`removeAllListeners()`](#removealllisteners)
* [Interfaces](#interfaces)
* [Type Aliases](#type-aliases)

</docgen-index>

<docgen-api>
<!--Update the source file JSDoc comments and rerun docgen to update the docs below-->

### configure(...)

```typescript
configure(options: ConfigureOptions) => Promise<void>
```

Configure once at startup. Native platforms drain the purchase retry
queue and report the install as launch chores (both idempotent), and
start the store observer: iOS watches StoreKit 2 `Transaction.updates`
(renewals, Ask to Buy approvals, refunds, purchases on another device),
Android replays Play Billing purchases. Observed transactions are
registered with proof and then finished/acknowledged by Revnix, so a
purchase you also register from JS comes back `duplicate: true` — not
an error. If another IAP plugin must finish iOS transactions itself,
keep that in mind: Revnix finishes only after the claim is recorded or
durably queued. Calling configure again retires the previous observer.

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


### identify(...)

```typescript
identify(options: { userId: string; }) => Promise<{ customerId: string; }>
```

Adopt `userId` as this device's customer id locally (no network call).
Empty or over 200 characters is ignored. Native only.

| Param         | Type                             |
| ------------- | -------------------------------- |
| **`options`** | <code>{ userId: string; }</code> |

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

Gate helper; never rejects. Unknown or unreachable resolves false, so
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
durably and the call rejects; it is never lost.

| Param         | Type                                                                    |
| ------------- | ----------------------------------------------------------------------- |
| **`options`** | <code><a href="#registerpurchaseinput">RegisterPurchaseInput</a></code> |

**Returns:** <code>Promise&lt;<a href="#registerpurchaseresult">RegisterPurchaseResult</a>&gt;</code>

--------------------


### purchase(...)

```typescript
purchase(options: PurchaseOptions) => Promise<{ result: RegisterPurchaseResult | null; }>
```

Buy a product through StoreKit 2 (iOS) or Google Play Billing (Android):
opens the store sheet, registers the purchase with Revnix (store proof
attached), finishes the transaction and returns the registration. Resolves
`{ result: null }` only when the customer cancels or the purchase is
pending (Ask to Buy, cash). When the store charged but registration
failed it rejects with the same error `registerPurchase` would: retryable
means the claim is queued durably and the transaction finished,
non-retryable (e.g. `purchase_blocked`) leaves it unfinished. Rejects
`product_not_found` when the store has no such product and `store_error`
for other store failures (`isRetryable` only for transient ones). Web
rejects: purchases are mobile only.

| Param         | Type                                                        |
| ------------- | ----------------------------------------------------------- |
| **`options`** | <code><a href="#purchaseoptions">PurchaseOptions</a></code> |

**Returns:** <code>Promise&lt;{ result: <a href="#registerpurchaseresult">RegisterPurchaseResult</a> | null; }&gt;</code>

--------------------


### restore()

```typescript
restore() => Promise<{ restored: number; }>
```

Re-register everything the device owns (iOS syncs with the App Store
first). The server dedupes. Resolves the number of claims delivered or
durably queued.

**Returns:** <code>Promise&lt;{ restored: number; }&gt;</code>

--------------------


### retryPendingPurchases()

```typescript
retryPendingPurchases() => Promise<{ delivered: number; }>
```

Drain the persistent retry queue. Safe on every launch/foreground;
the server dedupes on the purchase key. (Web reports `delivered: 0`;
react-native-revnix drains internally without a count.)

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


### updateSkanConversionValue(...)

```typescript
updateSkanConversionValue(options: { value: number; coarse?: 'low' | 'medium' | 'high'; lockWindow?: boolean; }) => Promise<void>
```

iOS only; no-op on Android and web. Sets an SKAdNetwork conversion
value — registration with Apple already happened automatically inside
`registerInstall`. `value` is the fine-grained conversion value, 0-63;
`coarse` is Apple's low/medium/high tier. The value goes to Apple only,
never to Revnix. Requires `NSAdvertisingAttributionReportEndpoint` in
the app's Info.plist, or Apple never delivers the postback.

| Param         | Type                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------- |
| **`options`** | <code>{ value: number; coarse?: 'low' \| 'medium' \| 'high'; lockWindow?: boolean; }</code> |

--------------------


### logPaywallShown(...)

```typescript
logPaywallShown(options?: { placementKey?: string | undefined; paywallId?: string | undefined; productsShown?: RevnixPaywallProductShown[] | undefined; } | undefined) => Promise<{ viewId?: string; }>
```

Fire-and-forget paywall impression. Call when the paywall becomes
visible, not when you start loading it.

Resolves with the view id the beacon generated (REV-252), or undefined on
a host that predates close reporting. Hand that id to `logPaywallClosed`
when the customer dismisses THIS display: the two events sharing one view
id is what lets the ledger pair a close with the display it ended.
`renderRevnixPaywall` does all of this for you.

| Param         | Type                                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| **`options`** | <code>{ placementKey?: string; paywallId?: string; productsShown?: RevnixPaywallProductShown[]; }</code> |

**Returns:** <code>Promise&lt;{ viewId?: string; }&gt;</code>

--------------------


### logPaywallClosed(...)

```typescript
logPaywallClosed(options: { viewId: string; placementKey?: string; paywallId?: string; }) => Promise<void>
```

Fire-and-forget paywall dismissal (REV-252) — the other half of a
display's life. Idempotent per view id, exactly like the impression.
Pass the id `logPaywallShown` resolved with for this display.

A close is a DECLINE. Do not report one for a display that ended in a
purchase — with implicit placements on, a close is also the
`paywall_decline` moment, and a win-back offer seconds after a successful
purchase is the one thing an operator never means.

| Param         | Type                                                                        |
| ------------- | --------------------------------------------------------------------------- |
| **`options`** | <code>{ viewId: string; placementKey?: string; paywallId?: string; }</code> |

--------------------


### logPaywallEvent(...)

```typescript
logPaywallEvent(options: { event: RevnixPaywallEvent; viewId: string; placementKey?: string; paywallId?: string; productId?: string; code?: string; message?: string; eventId?: string; }) => Promise<void>
```

Report one of the six paywall interactions (REV-263) — what the customer
DID on a display, between the `logPaywallShown` that opened it and the
`logPaywallClosed` (or purchase) that ended it.

Fire-and-forget like the other beacons.

`viewId` is the id `logPaywallShown` resolved with for THIS display.
Passing it is what threads the whole life of one impression together and
puts the event on the paywall's own analytics row.

`renderRevnixPaywall` reports `selected`, `purchase_started`, `restore`
and a no-products `error` for you. The purchase OUTCOME is yours: only
your app performs the store call, so report `purchase_abandoned` /
`purchase_failed` from your own purchase error handling.

`eventId` is the idempotency key and defaults to `viewId`, which caps the
report at one per display per event. Pass one per occurrence — and reuse
it across your own retries — to record each occurrence.

| Param         | Type                                                                                                                                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`options`** | <code>{ event: <a href="#revnixpaywallevent">RevnixPaywallEvent</a>; viewId: string; placementKey?: string; paywallId?: string; productId?: string; code?: string; message?: string; eventId?: string; }</code> |

--------------------


### logAdRevenue(...)

```typescript
logAdRevenue(options: { revenue: number; currency: string; network?: string; mediation?: string; adUnit?: string; placement?: string; format?: string; eventId?: string; }) => Promise<void>
```

PT8: report impression-level ad revenue from your mediation SDK's paid-event
callback (AdMob paid event, AppLovin MAX ad revenue paid). Fire-and-forget.

| Param         | Type                                                                                                                                                              |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`options`** | <code>{ revenue: number; currency: string; network?: string; mediation?: string; adUnit?: string; placement?: string; format?: string; eventId?: string; }</code> |

--------------------


### track(...)

```typescript
track(options: { event: string; properties?: Record<string, string | number | boolean>; eventId?: string; }) => Promise<void>
```

MS8: report a custom in-app event, name + optional flat properties.
Fire-and-forget, like the other beacons. Not for purchases — those stay
on `registerPurchase`. `event` must match `^[a-z0-9_]{1,64}$`.

| Param         | Type                                                                                                                                    |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **`options`** | <code>{ event: string; properties?: <a href="#record">Record</a>&lt;string, string \| number \| boolean&gt;; eventId?: string; }</code> |

--------------------


### flushEvents()

```typescript
flushEvents() => Promise<void>
```

Send every queued event now instead of waiting for the next batch.
Events are batched and persisted, so a flush is only needed before
something that may kill the process. (Web: no-op.)

--------------------


### preload(...)

```typescript
preload(options: { placementKeys: string[]; }) => Promise<void>
```

Warm the placement cache (and, on Android, paywall images) so the next
`resolvePlacement` is instant. Failures are swallowed. (Web: no-op.)

| Param         | Type                                      |
| ------------- | ----------------------------------------- |
| **`options`** | <code>{ placementKeys: string[]; }</code> |

--------------------


### setAttribution(...)

```typescript
setAttribution(options: { provider: MmpProvider; network: string; campaign?: string; adGroup?: string; creative?: string; }) => Promise<void>
```

PT11: hand the SDK an attribution verdict your MMP (Adjust, AppsFlyer,
…) already reached, from that MMP's own callback. Fire-and-forget like
the other beacons.

| Param         | Type                                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **`options`** | <code>{ provider: <a href="#mmpprovider">MmpProvider</a>; network: string; campaign?: string; adGroup?: string; creative?: string; }</code> |

--------------------


### setPushToken(...)

```typescript
setPushToken(options: { token: string; }) => Promise<void>
```

Register this device's push token for uninstall measurement: Revnix
sends a daily silent probe and records `app.uninstalled` when APNs/FCM
report the token dead. iOS/Android only (no-op on web),
fire-and-forget.

| Param         | Type                            |
| ------------- | ------------------------------- |
| **`options`** | <code>{ token: string; }</code> |

--------------------


### requestTrackingAuthorization()

```typescript
requestTrackingAuthorization() => Promise<{ status: number; }>
```

TP3: show Apple's App Tracking Transparency prompt and return its
answer: 0 notDetermined, 1 restricted, 2 denied, 3 authorized, or -1
off iOS. Stores `att_status` on the customer, plus `idfa` when
authorized. Needs `NSUserTrackingUsageDescription` in Info.plist.

**Returns:** <code>Promise&lt;{ status: number; }&gt;</code>

--------------------


### setAttributes(...)

```typescript
setAttributes(options: { attributes: Record<string, string | number | null>; }) => Promise<void>
```

Set attributes on the current customer. Attributes are what A/B-test
audiences target; set `country`, `app_version`, `locale`, or any custom
key you want to segment on. `null` deletes a key.

Rejects, unlike the fire-and-forget beacons: the next placement resolve
may depend on these. `email` and `username` are reserved (secret key
only), and an attribute your backend already set cannot be changed from
a device.

| Param         | Type                                                                                               |
| ------------- | -------------------------------------------------------------------------------------------------- |
| **`options`** | <code>{ attributes: <a href="#record">Record</a>&lt;string, string \| number \| null&gt;; }</code> |

--------------------


### handleDeepLink(...)

```typescript
handleDeepLink(options: { url: string; }) => Promise<void>
```

REV-272: hand the SDK the URL that opened your app, forwarded from your
`appUrlOpen` listener — it also carries the URL that launched a closed
app, on both platforms. Don't also pass `App.getLaunchUrl()`, that is
the same open and would count twice; the launch URL goes to the first
`appUrlOpen` listener only.

This is the one implicit moment the SDK cannot see for itself — the URL
reaches the host's entry point, and an SDK intercepting it would be
fighting the app's routing. Every link is reported so its `link.*`
attributes land on the customer; it presents a paywall only when implicit
placements are on and `deeplink_open` is configured in the dashboard.

| Param         | Type                          |
| ------------- | ----------------------------- |
| **`options`** | <code>{ url: string; }</code> |

--------------------


### resolveDeepLink(...)

```typescript
resolveDeepLink(options: { url: string; }) => Promise<{ url: string; }>
```

REV-299: unwrap a link an email service provider (Mailchimp, SendGrid,
…) wrapped in its own click-tracking domain, e.g.
`https://click.mailchimp.com/track/abc` back to the
`com.yourapp://promo?utm_source=email` it redirects to. Route the
result the same way you would any other deep link, typically by handing
it to `handleDeepLink`. Rejects before `configure()`; otherwise never
rejects: a link that cannot be resolved
(network failure, not a tracked domain) comes back unchanged, so the
result may still be an http(s) URL when the chain could not be
unwrapped; check its scheme before routing on it.

| Param         | Type                          |
| ------------- | ----------------------------- |
| **`options`** | <code>{ url: string; }</code> |

**Returns:** <code>Promise&lt;{ url: string; }&gt;</code>

--------------------


### getLastDeepLink()

```typescript
getLastDeepLink() => Promise<{ lastDeepLink: LastDeepLink | null; }>
```

The most recent deep link the native SDK recorded: a URL you passed to
`handleDeepLink`, or a deferred deep link delivered to the
`deferredDeepLink` listener, whichever came last. Nothing else is
recorded, so the URL that launched a closed app counts only once your
`appUrlOpen` listener has forwarded it to `handleDeepLink`. Dashboard
preview links are never recorded. Resolves `null` before any link has
been recorded, and always `null` on web for now. On iOS and Android it
rejects before `configure()`.

**Returns:** <code>Promise&lt;{ lastDeepLink: <a href="#lastdeeplink">LastDeepLink</a> | null; }&gt;</code>

--------------------


### getAttribution()

```typescript
getAttribution() => Promise<{ attribution: RevnixAttribution | null; }>
```

AT1: the install-attribution verdict the native SDK holds for this
customer — the same verdict the `attribution` listener delivers, read
back on demand. `null` when no install has been recorded yet, or the
request failed. On Capacitor this costs one GET per cold start (the
native client only fetches on its own once a callback is set, and here
one always is — see the `attribution` listener). Always `null` on web.

**Returns:** <code>Promise&lt;{ attribution: <a href="#revnixattribution">RevnixAttribution</a> | null; }&gt;</code>

--------------------


### handleInstallReferrer(...)

```typescript
handleInstallReferrer(options: { referrer: string; }) => Promise<void>
```

REV-299: Android only. `configure()` already reads the Play Install
Referrer once per install; call this only with a referrer you read some
other way, passed verbatim. Resolves as a no-op on iOS and web:
iOS has no install referrer, and a Capacitor web app has no store
install to defer a link from.

On Android, `configure()` must run first — like every other Android
method, this rejects if it hasn't. A host that reads the referrer
during its own boot must await/catch this call (rather than fire it
before `configure()`), or the referrer — and the deferred link it
carries — is lost for good.

| Param         | Type                               |
| ------------- | ---------------------------------- |
| **`options`** | <code>{ referrer: string; }</code> |

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


### addListener('implicitPaywall', ...)

```typescript
addListener(eventName: 'implicitPaywall', listenerFunc: (trigger: ImplicitTrigger) => void) => Promise<PluginListenerHandle>
```

REV-272: one of the six implicit moments resolved to a paywall. Present
it however your app presents paywalls; the plugin deliberately does not
present for you, because it does not own your routing and a paywall
thrown over a splash view is worse than no paywall.

Requires `implicitPlacements: true` in configure().

⚠️ Pass `trigger.resolution.placementKey` to `logPaywallShown` for the
display you present. That is what tells the SDK this display came FROM an
implicit trigger, and it is the only thing that stops a `paywall_decline`
paywall from firing `paywall_decline` again when the customer dismisses
it — a loop with no way out but force-quitting. The server refuses to
serve back the very same paywall as a backstop, but it cannot see a rule
that points at a DIFFERENT paywall which points back.

| Param              | Type                                                                              |
| ------------------ | --------------------------------------------------------------------------------- |
| **`eventName`**    | <code>'implicitPaywall'</code>                                                    |
| **`listenerFunc`** | <code>(trigger: <a href="#implicittrigger">ImplicitTrigger</a>) =&gt; void</code> |

**Returns:** <code>Promise&lt;<a href="#pluginlistenerhandle">PluginListenerHandle</a>&gt;</code>

--------------------


### addListener('deferredDeepLink', ...)

```typescript
addListener(eventName: 'deferredDeepLink', listenerFunc: (link: DeferredDeepLink) => void) => Promise<PluginListenerHandle>
```

REV-299: a deferred deep link the server matched to this install — the
link a customer clicked before installing. Fires at most once per
install. Android: `exact`, matched from the referrer passed to
`handleInstallReferrer`. iOS: `probabilistic`, matched by the server on
install (iOS has no install referrer, but does fire this). An event
that fires before this listener is attached is retained until it is.

| Param              | Type                                                                             |
| ------------------ | -------------------------------------------------------------------------------- |
| **`eventName`**    | <code>'deferredDeepLink'</code>                                                  |
| **`listenerFunc`** | <code>(link: <a href="#deferreddeeplink">DeferredDeepLink</a>) =&gt; void</code> |

**Returns:** <code>Promise&lt;<a href="#pluginlistenerhandle">PluginListenerHandle</a>&gt;</code>

--------------------


### addListener('attribution', ...)

```typescript
addListener(eventName: 'attribution', listenerFunc: (attribution: RevnixAttribution) => void) => Promise<PluginListenerHandle>
```

AT1: the install-attribution verdict, delivered the first time the
native SDK sees one after cold-start install registration, and again
whenever it changes (e.g. a late Android referrer reconciling an
earlier organic verdict) — de-duplicated natively. An event that fires
before this listener is attached is retained until it is.

| Param              | Type                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------- |
| **`eventName`**    | <code>'attribution'</code>                                                                |
| **`listenerFunc`** | <code>(attribution: <a href="#revnixattribution">RevnixAttribution</a>) =&gt; void</code> |

**Returns:** <code>Promise&lt;<a href="#pluginlistenerhandle">PluginListenerHandle</a>&gt;</code>

--------------------


### removeAllListeners()

```typescript
removeAllListeners() => Promise<void>
```

--------------------


### Interfaces


#### ConfigureOptions

| Prop                       | Type                                                | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`apiKey`**               | <code>string</code>                                 | Publishable key (`rvx_pk_live_…` / `rvx_pk_test_…`). The key fixes app + environment server-side. Secret keys must never ship in a binary, so merging history is server-side (`POST /v1/identify` with a secret key); `identify()` only adopts the id on this device. alias stays server-only.                                                                                                                                                                                           |
| **`baseUrl`**              | <code>string</code>                                 | e.g. `https://your-deployment.convex.site`                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **`timeoutMs`**            | <code>number</code>                                 | Per-request timeout in ms. Default 10 000.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **`entitlementsTtlMs`**    | <code>number</code>                                 | Soft TTL on entitlement reads in ms. Default 30 000; 0 = always fetch.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **`offlineMaxCacheAgeMs`** | <code>number</code>                                 | Snapshots older than this serve as all-inactive. Default 14 days.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **`device`**               | <code><a href="#devicefacts">DeviceFacts</a></code> | REV-268: overrides for the device facts sent with every placement resolve, so targeting rules ("US storefront", "app version at least 3") can be evaluated on the request that serves the paywall. The native SDKs detect platform, OS version, app version, locale, currency, model and the sandbox flag themselves (the web build detects what a browser exposes); pass only what you know better. Stored on the customer as reserved `device.*` attributes, visible in the dashboard. |
| **`implicitPlacements`**   | <code>boolean</code>                                | REV-272: turn on implicit placements — the six moments the SDK reports on its own (`app_install`, `app_launch`, `session_start`, `deeplink_open`, `paywall_decline`, `transaction_abandon`). With this on, the SDK asks `GET /v1/config` once and then fires only for the moments this app has configured in the dashboard, emitting each one that resolves to a paywall as an `implicitPaywall` event. Off by default: without a listener there is nothing to do with the answer.       |
| **`sessionTimeoutMs`**     | <code>number</code>                                 | REV-272: how long the app must have been backgrounded for the return to count as a new session rather than an app switch. Default 30 minutes.                                                                                                                                                                                                                                                                                                                                            |
| **`skan`**                 | <code>boolean</code>                                | iOS only. Default true; set false to opt out of SKAdNetwork entirely.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **`deviceIntegrity`**      | <code>boolean</code>                                | iOS and Android only. Default false. Attach Apple App Attest / Google Play Integrity evidence to install reports; pairs with "Require device integrity" in the dashboard. Ignored on web.                                                                                                                                                                                                                                                                                                |
| **`collectAdvertisingId`** | <code>boolean</code>                                | Android only. Default false. Collect the Google Advertising ID; the app must add play-services-ads-identifier and the AD_ID permission. When limit-ad-tracking is on no id is sent and a previously sent id is cleared. If play-services-ads-identifier is missing no id is collected and the 'diagnostic' listener reports it. Ignored on iOS and web.                                                                                                                                  |
| **`attWaitTimeoutMs`**     | <code>number</code>                                 | iOS only (TP3). Hold the first `registerInstall` report up to this many milliseconds while the App Tracking Transparency prompt is unanswered, so the install goes out with the IDFA already stored. Unset = never wait.                                                                                                                                                                                                                                                                 |


#### DeviceFacts

REV-268: the app-suppliable half of the device attribute contract. Every
field is optional; the server normalizes case, locale separators and
alpha-3 storefronts.

| Prop             | Type                 | Description                                         |
| ---------------- | -------------------- | --------------------------------------------------- |
| **`platform`**   | <code>string</code>  | "ios", "android", "web", … — lowercase family name. |
| **`osVersion`**  | <code>string</code>  | e.g. "18.1".                                        |
| **`appVersion`** | <code>string</code>  | The host app's version, e.g. "1.2.10".              |
| **`locale`**     | <code>string</code>  | "en-US" or "en_US".                                 |
| **`currency`**   | <code>string</code>  | ISO 4217, e.g. "USD".                               |
| **`storefront`** | <code>string</code>  | Store country — alpha-2 ("US") or alpha-3 ("USA").  |
| **`model`**      | <code>string</code>  | Hardware model identifier.                          |
| **`sandbox`**    | <code>boolean</code> | True in a sandbox / debug build.                    |


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

| Prop                       | Type                 | Description                                                                                                       |
| -------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **`eventId`**              | <code>string</code>  |                                                                                                                   |
| **`seq`**                  | <code>number</code>  | Ledger position; pass to waitForEntitlements to unlock.                                                           |
| **`duplicate`**            | <code>boolean</code> |                                                                                                                   |
| **`customerId`**           | <code>string</code>  | The id to use going forward. The SDK adopts it automatically.                                                     |
| **`transferred`**          | <code>boolean</code> |                                                                                                                   |
| **`ownedByOtherCustomer`** | <code>boolean</code> |                                                                                                                   |
| **`refused`**              | <code>string</code>  |                                                                                                                   |
| **`restored`**             | <code>boolean</code> |                                                                                                                   |
| **`provisional`**          | <code>boolean</code> | Recorded without store proof: live but time-boxed until the store confirms. Expect true for Google device claims. |


#### RegisterPurchaseInput

| Prop                        | Type                                                        | Description                                                        |
| --------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| **`source`**                | <code><a href="#revnixstorekind">RevnixStoreKind</a></code> |                                                                    |
| **`token`**                 | <code>string</code>                                         | Apple: originalTransactionId · Google: purchaseToken.              |
| **`productId`**             | <code>string</code>                                         |                                                                    |
| **`transactionId`**         | <code>string</code>                                         | Google: this is the purchaseToken too (the established rule).      |
| **`occurredAt`**            | <code>number</code>                                         |                                                                    |
| **`expiresAt`**             | <code>number</code>                                         |                                                                    |
| **`signedTransactionInfo`** | <code>string</code>                                         | StoreKit 2 JWS: the proof path, claims without it are provisional. |


#### PurchaseOptions

| Prop            | Type                |
| --------------- | ------------------- |
| **`productId`** | <code>string</code> |


#### PlacementResolution

| Prop               | Type                                                                        | Description                                                                                                                                                                    |
| ------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`status`**       | <code>string</code>                                                         |                                                                                                                                                                                |
| **`placementKey`** | <code>string</code>                                                         |                                                                                                                                                                                |
| **`revision`**     | <code>number</code>                                                         | Published catalog revision this resolution came from.                                                                                                                          |
| **`offering`**     | <code><a href="#placementoffering">PlacementOffering</a></code>             |                                                                                                                                                                                |
| **`paywall`**      | <code><a href="#placementpaywall">PlacementPaywall</a></code>               | Remote paywall render contract: your app renders it in v1. Absent when the placement has no paywall attached (the wire sends null; native bridges omit the key).               |
| **`experiment`**   | <code><a href="#placementexperiment">PlacementExperiment</a> \| null</code> | Sticky experiment assignment for this customer; `null` when no running experiment covers the placement (older servers omit the key, and every bridge normalizes that to null). |
| **`preview`**      | <code>boolean</code>                                                        | Set only on a dashboard QR preview.                                                                                                                                            |


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


#### PlacementPaywall

| Prop            | Type                                                    |
| --------------- | ------------------------------------------------------- |
| **`paywallId`** | <code>string</code>                                     |
| **`name`**      | <code>string</code>                                     |
| **`config`**    | <code><a href="#paywallconfig">PaywallConfig</a></code> |


#### PaywallConfig

Remote paywall design attached to a placement. Render contract: the app
draws this with its own components; prices still come from the store
(StoreKit / Play Billing) so the display never disagrees with the charge.

| Prop                     | Type                                                                                                                            | Description                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`template`**           | <code>'focus' \| 'feature-list' \| 'minimal' \| 'hero' \| 'timeline' \| 'plans' \| 'feature-grid' \| 'offer' \| 'reveal'</code> | Layout: the screen structure to render. The dashboard's template gallery is presets over these layouts; the first three are the original templates and render exactly as before.                                                                                                                                                                                                                                        |
| **`mode`**               | <code>'dark' \| 'light'</code>                                                                                                  | Color scheme the paywall renders in. Absent (legacy config) = dark.                                                                                                                                                                                                                                                                                                                                                     |
| **`headline`**           | <code>string</code>                                                                                                             |                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **`subheadline`**        | <code>string</code>                                                                                                             |                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **`features`**           | <code>PaywallFeature[]</code>                                                                                                   |                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **`ctaLabel`**           | <code>string</code>                                                                                                             |                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **`highlightPackageId`** | <code>string</code>                                                                                                             | packageId of the visually highlighted package.                                                                                                                                                                                                                                                                                                                                                                          |
| **`badgeText`**          | <code>string</code>                                                                                                             | Badge on the highlighted package, e.g. "SAVE 17%".                                                                                                                                                                                                                                                                                                                                                                      |
| **`accent`**             | <code>string</code>                                                                                                             | Accent hex like "#6478ff"; fall back to the app theme when absent.                                                                                                                                                                                                                                                                                                                                                      |
| **`heroImageUrl`**       | <code>string</code>                                                                                                             | Hero image URL rendered above the headline in place of the icon tile.                                                                                                                                                                                                                                                                                                                                                   |
| **`review`**             | <code><a href="#paywallreview">PaywallReview</a></code>                                                                         |                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **`offer`**              | <code><a href="#paywalloffer">PaywallOffer</a></code>                                                                           |                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **`footer`**             | <code><a href="#paywallfooter">PaywallFooter</a></code>                                                                         |                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **`blocks`**             | <code>unknown</code>                                                                                                            | A designed paywall: the block tree the dashboard's builder authored. When present `renderRevnixPaywall` renders THIS and the fields above act as the fallback for clients that predate block rendering — so an app on an older SDK keeps showing a sane classic screen instead of nothing. Typed as `PaywallBlockDoc` in the renderer; opaque here so a consumer that only reads the config pulls in no renderer types. |


#### PaywallFeature

| Prop              | Type                |
| ----------------- | ------------------- |
| **`icon`**        | <code>string</code> |
| **`title`**       | <code>string</code> |
| **`description`** | <code>string</code> |


#### PaywallReview

Social proof, dashboard-configured. Any layout renders the pieces that
are set: stars/quote card above the packages, `count` under the CTA.

| Prop         | Type                | Description                                      |
| ------------ | ------------------- | ------------------------------------------------ |
| **`rating`** | <code>number</code> | 0–5; rendered as a star row.                     |
| **`quote`**  | <code>string</code> |                                                  |
| **`author`** | <code>string</code> |                                                  |
| **`count`**  | <code>string</code> | e.g. "Join 2M+ users"; small line under the CTA. |


#### PaywallOffer

Win-back/offer presentation: anchor price struck through on the
highlighted package, urgency line above the CTA. Any layout.

| Prop                     | Type                |
| ------------------------ | ------------------- |
| **`strikethroughPrice`** | <code>string</code> |
| **`urgencyText`**        | <code>string</code> |


#### PaywallFooter

Footer links, dashboard-configured. Absent (legacy config) = show all
three. When a URL is set open it directly; otherwise run your own
terms/privacy handler.

| Prop              | Type                 |
| ----------------- | -------------------- |
| **`showRestore`** | <code>boolean</code> |
| **`showTerms`**   | <code>boolean</code> |
| **`showPrivacy`** | <code>boolean</code> |
| **`termsUrl`**    | <code>string</code>  |
| **`privacyUrl`**  | <code>string</code>  |


#### PlacementExperiment

A/B experiment assignment (REV-219). The served `offering`/`paywall` are
already the assigned variant's; this is attribution metadata, not
something the app needs to branch on.

| Prop            | Type                |
| --------------- | ------------------- |
| **`key`**       | <code>string</code> |
| **`variantId`** | <code>string</code> |


#### RevnixPaywallProductShown

One product visible on a displayed paywall.

| Prop              | Type                |
| ----------------- | ------------------- |
| **`productId`**   | <code>string</code> |
| **`priceLabel`**  | <code>string</code> |
| **`amountMinor`** | <code>number</code> |
| **`currency`**    | <code>string</code> |


#### LastDeepLink

The last deep link the native SDK recorded: a link passed to
`handleDeepLink`, or a delivered deferred deep link. See
`RevnixPlugin.getLastDeepLink`.

| Prop             | Type                | Description         |
| ---------------- | ------------------- | ------------------- |
| **`url`**        | <code>string</code> |                     |
| **`receivedAt`** | <code>number</code> | Epoch milliseconds. |


#### RevnixAttribution

AT1: the install-attribution verdict the server reached for this
customer. See `RevnixPlugin.getAttribution`.

| Prop                 | Type                                                  | Description                                                                     |
| -------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| **`installMatch`**   | <code><a href="#installmatch">InstallMatch</a></code> |                                                                                 |
| **`attributedAt`**   | <code>number</code>                                   | Epoch milliseconds.                                                             |
| **`reattributedAt`** | <code>number</code>                                   | Epoch milliseconds a later match superseded the original verdict.               |
| **`linkToken`**      | <code>string</code>                                   |                                                                                 |
| **`referrerSource`** | <code>string</code>                                   | AT8: Android referrer source (play/huawei/samsung/xiaomi/vivo/meta/preinstall). |
| **`matchSignals`**   | <code>string[]</code>                                 | AT6: which probabilistic signals matched (iOS).                                 |
| **`source`**         | <code>string</code>                                   |                                                                                 |
| **`medium`**         | <code>string</code>                                   |                                                                                 |
| **`campaign`**       | <code>string</code>                                   |                                                                                 |
| **`term`**           | <code>string</code>                                   |                                                                                 |
| **`content`**        | <code>string</code>                                   |                                                                                 |


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


#### ImplicitTrigger

REV-272: one implicit moment that resolved to a paywall. Only ever
delivered WITH a paywall — a moment the server answered with none (nothing
attached, or the same paywall the customer is leaving) is reported and
then dropped, since there is nothing to present.

| Prop             | Type                                                                | Description                                                           |
| ---------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **`placement`**  | <code><a href="#implicitplacement">ImplicitPlacement</a></code>     | Which of the six fired.                                               |
| **`resolution`** | <code><a href="#placementresolution">PlacementResolution</a></code> | The resolution, exactly as `resolvePlacement` would have returned it. |


#### DeferredDeepLink

REV-299: a deferred deep link the server attributed to this install — the
link a customer clicked before installing. Fires at most once per install.
Android: `exact`, matched from the referrer passed to
`handleInstallReferrer`. iOS: `probabilistic`, matched by the server on
install (iOS has no install referrer). An event that fires before the
listener is attached is retained until it is.

| Prop        | Type                                                                    |
| ----------- | ----------------------------------------------------------------------- |
| **`url`**   | <code>string</code>                                                     |
| **`match`** | <code><a href="#deferreddeeplinkmatch">DeferredDeepLinkMatch</a></code> |


### Type Aliases


#### RevnixStoreKind

Wire-identical to the other Revnix SDKs (openapi.yaml is the source).

<code>'apple' | 'google'</code>


#### RevnixPaywallEvent

REV-263: the six paywall interactions `logPaywallEvent` can report — what
the customer did on a display, between the view that opened it and the
close or purchase that ended it. The server turns each into the ledger type
`paywall.&lt;name&gt;`.

<code>'selected' | 'purchase_started' | 'purchase_abandoned' | 'purchase_failed' | 'restore' | 'error'</code>


#### Record

Construct a type with a set of properties K of type T

<code>{ [P in K]: T; }</code>


#### MmpProvider

PT11: the MMP that reached this attribution verdict.

<code>'adjust' | 'appsflyer' | 'singular' | 'branch' | 'kochava' | 'tenjin' | 'airbridge'</code>


#### InstallMatch

AT1: how the server matched this install. `organic` when nothing did.

<code>'referrer' | 'click' | 'impression' | 'organic'</code>


#### ImplicitPlacement

REV-272: which of the six implicit moments fired. Lowercase throughout —
`deeplink_open`, not Superwall's `deepLink_open`, because a placement key
must match `^[a-z0-9][a-z0-9._-]{0,63}$` server-side.

<code>'app_install' | 'app_launch' | 'session_start' | 'deeplink_open' | 'paywall_decline' | 'transaction_abandon'</code>


#### DeferredDeepLinkMatch

REV-299: how the server matched a deferred deep link to this install.

<code>'exact' | 'probabilistic'</code>

</docgen-api>
