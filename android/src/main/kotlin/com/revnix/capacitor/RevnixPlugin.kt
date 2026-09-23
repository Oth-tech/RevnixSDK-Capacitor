package com.revnix.capacitor

import android.app.Application
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.revnix.CustomerEntitlements
import com.revnix.PlacementResolution
import com.revnix.RevnixAttribution
import com.revnix.RegisterPurchaseInput
import com.revnix.RegisterPurchaseResult
import com.revnix.RevnixClient
import com.revnix.RevnixConfig
import com.revnix.RevnixError
import com.revnix.RevnixPaywallEvent
import com.revnix.RevnixStore
import com.revnix.DeviceFacts
import com.revnix.REVNIX_DEFAULT_SESSION_TIMEOUT_MS
import com.revnix.android.AndroidDeviceFacts
import com.revnix.android.AndroidLifecycle
import com.revnix.android.AndroidStorage
import com.revnix.android.PlayBillingConnector
import com.revnix.android.PlayInstallReferrer
import kotlin.time.Duration.Companion.milliseconds
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import org.json.JSONObject

/**
 * Android side of the Capacitor bridge — a thin adapter over `revnix-kotlin`
 * (vendored under com.revnix until it ships to Maven Central).
 *
 * Holds no policy of its own. In particular the Play Billing acknowledgement
 * ordering (acknowledge only AFTER the claim is recorded or durably queued)
 * stays inside [PlayBillingConnector], where it is tested — pulling it up
 * into bridge code is how that rule gets broken.
 */
@CapacitorPlugin(name = "Revnix")
class RevnixPlugin : Plugin() {

    private var client: RevnixClient? = null
    private var billing: PlayBillingConnector? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    override fun handleOnDestroy() {
        billing?.close()
        client?.close()
        scope.cancel()
    }

    @PluginMethod
    fun configure(call: PluginCall) {
        val apiKey = call.getString("apiKey")
        val baseUrl = call.getString("baseUrl")
        if (apiKey == null || baseUrl == null) {
            call.reject("apiKey and baseUrl are required", "invalid")
            return
        }

        fun duration(key: String, fallbackMs: Long) =
            (call.getDouble(key)?.toLong() ?: fallbackMs).milliseconds

        val created = RevnixClient(
            RevnixConfig(
                apiKey = apiKey,
                baseUrl = baseUrl,
                storage = AndroidStorage(context),
                timeout = duration("timeoutMs", 10_000),
                offlineMaxCacheAge = duration("offlineMaxCacheAgeMs", 14L * 24 * 3600 * 1000),
                entitlementsTtl = duration("entitlementsTtlMs", 30_000),
                onDiagnostic = { event ->
                    notifyListeners(
                        "diagnostic",
                        JSObject().apply {
                            put("op", event.op)
                            put("message", event.message)
                        },
                    )
                },
                // REV-268: revnix-kotlin detects the device facts; JS may
                // override the ones the app knows better.
                device = AndroidDeviceFacts.detect(context)
                    .overriddenBy(deviceOverrides(call.getObject("device"))),
                // REV-272: JS opts in explicitly — the plugin always has a
                // handler to give (the event emitter), so "is there a handler"
                // cannot be the signal the way it is in revnix-react.
                onImplicitPaywall = { trigger ->
                    // retainUntilConsumed: the launch moments fire during
                    // configure(), which a JS app typically calls BEFORE
                    // addListener resolves. Dropping those would lose the
                    // paywall after the ledger row was already written — the
                    // one failure here that looks like the server misbehaving.
                    notifyListeners(
                        "implicitPaywall",
                        JSObject().apply {
                            put("placement", trigger.placement.key)
                            put("resolution", js(trigger.resolution))
                        },
                        true,
                    )
                },
                implicitPlacements = call.getBoolean("implicitPlacements") ?: false,
                lifecycle = (context.applicationContext as? Application)
                    ?.let { AndroidLifecycle(it) },
                sessionTimeoutMs = call.getDouble("sessionTimeoutMs")?.toLong()
                    ?: REVNIX_DEFAULT_SESSION_TIMEOUT_MS,
                // retainUntilConsumed: fires during configure(), which a JS
                // app typically calls BEFORE addListener resolves. Same
                // reasoning as onImplicitPaywall above.
                onDeferredDeepLink = { url, match ->
                    notifyListeners(
                        "deferredDeepLink",
                        JSObject().apply {
                            put("url", url)
                            put("match", match.name.lowercase())
                        },
                        true,
                    )
                },
                onAttribution = { attribution ->
                    notifyListeners("attribution", js(attribution), true)
                },
            )
        )
        // REV-272: retire the previous client BEFORE replacing it. Its
        // AndroidLifecycle callbacks are registered on the Application and
        // outlive the plugin instance, so a re-configure without this leaves
        // two clients watching the foreground — every return would then mint
        // two session_start triggers and emit two implicitPaywall events.
        // Same reasoning as the billing connector below, different resource.
        client?.close()
        client = created
        // Owns connection, purchase replay, acknowledgement, and the queue drain.
        // A re-configure retires the previous connector first, or two would
        // replay and acknowledge the same purchases.
        billing?.close()
        billing = PlayBillingConnector.start(context, created)
        scope.launch {
            created.registerInstall(platform = "android-capacitor", appVersion = null)
        }
        PlayInstallReferrer.collect(context, created, platform = "android-capacitor")
        call.resolve()
    }

    /** JS-supplied device fact overrides (REV-268); null when none. */
    private fun deviceOverrides(obj: JSObject?): DeviceFacts? {
        if (obj == null) return null
        fun str(key: String) = if (obj.has(key)) obj.getString(key) else null
        return DeviceFacts(
            platform = str("platform"),
            osVersion = str("osVersion"),
            appVersion = str("appVersion"),
            locale = str("locale"),
            currency = str("currency"),
            storefront = str("storefront"),
            model = str("model"),
            sandbox = if (obj.has("sandbox")) obj.getBoolean("sandbox") else null,
        )
    }

    private fun requireClient(call: PluginCall): RevnixClient? {
        val active = client
        if (active == null) {
            call.reject("Revnix.configure() must be called first", "invalid")
        }
        return active
    }

    // MARK: - Identity

    @PluginMethod
    fun getCustomerId(call: PluginCall) {
        val active = requireClient(call) ?: return
        call.resolve(JSObject().put("customerId", active.customerId()))
    }

    @PluginMethod
    fun logout(call: PluginCall) {
        val active = requireClient(call) ?: return
        call.resolve(JSObject().put("customerId", active.logout()))
    }

    // MARK: - Entitlements

    @PluginMethod
    fun getEntitlements(call: PluginCall) {
        val active = requireClient(call) ?: return
        scope.launch {
            try {
                call.resolve(js(active.entitlements()))
            } catch (err: Throwable) {
                reject(call, err)
            }
        }
    }

    @PluginMethod
    fun getCachedEntitlements(call: PluginCall) {
        val active = requireClient(call) ?: return
        val snapshot = active.cachedEntitlements()
        val out = JSObject()
        if (snapshot == null) out.put("snapshot", JSONObject.NULL)
        else out.put("snapshot", js(snapshot))
        call.resolve(out)
    }

    @PluginMethod
    fun isEntitled(call: PluginCall) {
        val active = requireClient(call) ?: return
        val entitlementId = call.getString("entitlementId") ?: ""
        scope.launch {
            call.resolve(JSObject().put("entitled", active.isEntitled(entitlementId)))
        }
    }

    @PluginMethod
    fun waitForEntitlements(call: PluginCall) {
        val active = requireClient(call) ?: return
        val seq = (call.getDouble("seq") ?: 0.0).toLong()
        scope.launch {
            try {
                call.resolve(js(active.waitForEntitlements(seq)))
            } catch (err: Throwable) {
                reject(call, err)
            }
        }
    }

    // MARK: - Purchases

    @PluginMethod
    fun registerPurchase(call: PluginCall) {
        val active = requireClient(call) ?: return
        val token = call.getString("token")
        val productId = call.getString("productId")
        val transactionId = call.getString("transactionId")
        if (token == null || productId == null || transactionId == null) {
            call.reject("token, productId and transactionId are required", "invalid")
            return
        }
        val input = RegisterPurchaseInput(
            source = RevnixStore.fromWire(call.getString("source") ?: "google"),
            token = token,
            productId = productId,
            transactionId = transactionId,
            occurredAt = call.getDouble("occurredAt")?.toLong(),
            expiresAt = call.getDouble("expiresAt")?.toLong(),
            signedTransactionInfo = call.getString("signedTransactionInfo"),
        )
        scope.launch {
            try {
                call.resolve(js(active.registerPurchase(input)))
            } catch (err: Throwable) {
                reject(call, err)
            }
        }
    }

    @PluginMethod
    fun retryPendingPurchases(call: PluginCall) {
        val active = requireClient(call) ?: return
        scope.launch {
            call.resolve(JSObject().put("delivered", active.retryPendingPurchases()))
        }
    }

    @PluginMethod
    fun pendingPurchaseCount(call: PluginCall) {
        val active = requireClient(call) ?: return
        call.resolve(JSObject().put("count", active.pendingPurchaseCount()))
    }

    // MARK: - Placements & telemetry

    /**
     * REV-272: the URL that opened the app. Capacitor delivers it to the
     * host's own `appUrlOpen` listener, so the host forwards it here.
     */
    @PluginMethod
    fun handleDeepLink(call: PluginCall) {
        // Refused rather than silently accepted when unconfigured — a deep
        // link handler wired before configure() would otherwise look like it
        // worked and never fire a single moment. Matches every other method.
        val active = requireClient(call) ?: return
        val url = call.getString("url")
        if (url == null) {
            call.reject("url is required", "invalid")
            return
        }
        // Resolved immediately: this runs inside the host's appUrlOpen handler,
        // right before it routes, and the trigger is two network round trips.
        // Every Revnix telemetry call is a beacon, and this is one too.
        scope.launch { active.handleDeepLink(url) }
        call.resolve()
    }

    /**
     * REV-299: unwrap a link an email service provider wrapped in its own
     * click-tracking domain.
     */
    @PluginMethod
    fun resolveDeepLink(call: PluginCall) {
        val active = requireClient(call) ?: return
        val url = call.getString("url")
        if (url == null) {
            call.reject("url is required", "invalid")
            return
        }
        scope.launch { call.resolve(JSObject().put("url", active.resolveDeepLink(url))) }
    }

    @PluginMethod
    fun getLastDeepLink(call: PluginCall) {
        val active = requireClient(call) ?: return
        val lastDeepLink = active.getLastDeepLink()
        val out = JSObject()
        if (lastDeepLink == null) {
            out.put("lastDeepLink", JSONObject.NULL)
        } else {
            out.put(
                "lastDeepLink",
                JSObject().put("url", lastDeepLink.url).put("receivedAt", lastDeepLink.receivedAt),
            )
        }
        call.resolve(out)
    }

    @PluginMethod
    fun handleInstallReferrer(call: PluginCall) {
        val active = requireClient(call) ?: return
        val referrer = call.getString("referrer")
        if (referrer == null) {
            call.reject("referrer is required", "invalid")
            return
        }
        active.handleInstallReferrer(referrer, platform = "android-capacitor")
        call.resolve()
    }

    @PluginMethod
    fun getAttribution(call: PluginCall) {
        val active = requireClient(call) ?: return
        scope.launch {
            val attribution = active.getAttribution()
            val out = JSObject()
            if (attribution == null) out.put("attribution", JSONObject.NULL)
            else out.put("attribution", js(attribution))
            call.resolve(out)
        }
    }

    @PluginMethod
    fun resolvePlacement(call: PluginCall) {
        val active = requireClient(call) ?: return
        val key = call.getString("placementKey") ?: ""
        scope.launch {
            try {
                call.resolve(js(active.resolvePlacement(key)))
            } catch (err: Throwable) {
                reject(call, err)
            }
        }
    }

    @PluginMethod
    fun registerInstall(call: PluginCall) {
        val active = requireClient(call) ?: return
        val platform = call.getString("platform") ?: "android-capacitor"
        val appVersion = call.getString("appVersion")
        scope.launch {
            active.registerInstall(platform = platform, appVersion = appVersion)
            call.resolve()
        }
    }

    @PluginMethod
    fun logPaywallShown(call: PluginCall) {
        val active = requireClient(call) ?: return
        val placementKey = call.getString("placementKey")
        val paywallId = call.getString("paywallId")
        scope.launch {
            // REV-252: resolves with the view id so the JS side can pair this
            // display's close with it. An older JS caller ignores the field.
            val viewId = active.logPaywallDisplay(
                placementKey = placementKey,
                paywallId = paywallId,
            )
            call.resolve(JSObject().put("viewId", viewId))
        }
    }

    @PluginMethod
    fun logPaywallClosed(call: PluginCall) {
        val active = requireClient(call) ?: return
        val viewId = call.getString("viewId")
        if (viewId == null) {
            call.reject("viewId is required", "invalid")
            return
        }
        val placementKey = call.getString("placementKey")
        val paywallId = call.getString("paywallId")
        scope.launch {
            active.logPaywallClosed(
                viewId = viewId,
                placementKey = placementKey,
                paywallId = paywallId,
            )
            call.resolve()
        }
    }

    @PluginMethod
    fun logPaywallEvent(call: PluginCall) {
        val active = requireClient(call) ?: return
        val viewId = call.getString("viewId")
        if (viewId == null) {
            call.reject("viewId is required", "invalid")
            return
        }
        // REV-263: the wire name maps 1:1 onto the enum's wireName. Rejected
        // rather than silently dropped — an unknown name is a caller bug, and
        // the same string would have been a 400 at the API.
        val event = RevnixPaywallEvent.entries
            .firstOrNull { it.wireName == call.getString("event") }
        if (event == null) {
            call.reject("event must be one of the six paywall interactions", "invalid")
            return
        }
        val placementKey = call.getString("placementKey")
        val paywallId = call.getString("paywallId")
        val productId = call.getString("productId")
        val code = call.getString("code")
        val message = call.getString("message")
        val eventId = call.getString("eventId")
        scope.launch {
            active.logPaywallEvent(
                event = event,
                viewId = viewId,
                placementKey = placementKey,
                paywallId = paywallId,
                productId = productId,
                code = code,
                message = message,
                eventId = eventId,
            )
            call.resolve()
        }
    }

    @PluginMethod
    fun setAttributes(call: PluginCall) {
        val active = requireClient(call) ?: return
        val raw = call.getObject("attributes")
        if (raw == null) {
            call.reject("attributes object is required", "invalid")
            return
        }
        val attributes = mutableMapOf<String, Any?>()
        for (key in raw.keys()) {
            attributes[key] = if (raw.isNull(key)) null else raw.get(key)
        }
        scope.launch {
            try {
                active.setAttributes(attributes)
                call.resolve()
            } catch (err: Throwable) {
                reject(call, err)
            }
        }
    }

    // MARK: - Marshalling

    private fun js(snapshot: CustomerEntitlements): JSObject = JSObject().apply {
        put("customerId", snapshot.customerId)
        put("cursor", snapshot.cursor)
        snapshot.stale?.let { put("stale", it) }
        snapshot.fetchedAt?.let { put("fetchedAt", it) }
        put(
            "entitlements",
            org.json.JSONArray().apply {
                snapshot.entitlements.forEach { ent ->
                    put(JSObject().apply {
                        put("entitlementId", ent.entitlementId)
                        put("isActive", ent.isActive)
                        ent.expiresAt?.let { put("expiresAt", it) }
                        put(
                            "sources",
                            org.json.JSONArray().apply {
                                ent.sources.forEach { src ->
                                    put(JSObject().apply {
                                        put("kind", src.kind)
                                        put("key", src.key)
                                        put("isActive", src.isActive)
                                        src.expiresAt?.let { put("expiresAt", it) }
                                    })
                                }
                            },
                        )
                    })
                }
            },
        )
    }

    private fun js(result: RegisterPurchaseResult): JSObject = JSObject().apply {
        put("eventId", result.eventId)
        put("seq", result.seq)
        put("duplicate", result.duplicate)
        put("customerId", result.customerId)
        put("transferred", result.transferred)
        result.ownedByOtherCustomer?.let { put("ownedByOtherCustomer", it) }
        result.refused?.let { put("refused", it) }
        result.restored?.let { put("restored", it) }
        result.provisional?.let { put("provisional", it) }
    }

    private fun js(resolution: PlacementResolution): JSObject = JSObject().apply {
        put("status", resolution.status)
        put("placementKey", resolution.placementKey)
        put("revision", resolution.revision)
        put(
            "offering",
            JSObject().apply {
                put("offeringId", resolution.offering.offeringId)
                put("displayName", resolution.offering.displayName)
                resolution.offering.metadata?.let { put("metadata", js(it)) }
                put(
                    "packages",
                    org.json.JSONArray().apply {
                        resolution.offering.packages.forEach { pkg ->
                            put(JSObject().apply {
                                put("packageId", pkg.packageId)
                                put("productId", pkg.productId)
                            })
                        }
                    },
                )
            },
        )
        // The raw copies, not the typed `paywall` / `experiment`: JS owns the
        // parse, and the typed paywall is decoded through the native block
        // model, which drops what it does not know.
        resolution.paywallJson?.let { put("paywall", js(it)) }
        // REV-219: always present, per the TS contract — a null/absent wire
        // value both surface as JS null.
        when (val experiment = resolution.experimentJson) {
            null, JsonNull -> put("experiment", JSONObject.NULL)
            else -> put("experiment", js(experiment))
        }
    }

    private fun js(attribution: RevnixAttribution): JSObject = JSObject().apply {
        put("installMatch", attribution.installMatch)
        put("attributedAt", attribution.attributedAt)
        attribution.reattributedAt?.let { put("reattributedAt", it) }
        attribution.linkToken?.let { put("linkToken", it) }
        attribution.referrerSource?.let { put("referrerSource", it) }
        attribution.matchSignals?.let {
            put("matchSignals", org.json.JSONArray().apply { it.forEach { s -> put(s) } })
        }
        attribution.source?.let { put("source", it) }
        attribution.medium?.let { put("medium", it) }
        attribution.campaign?.let { put("campaign", it) }
        attribution.term?.let { put("term", it) }
        attribution.content?.let { put("content", it) }
    }

    /** kotlinx JsonElement → org.json, via its canonical string form. */
    private fun js(element: JsonElement): Any {
        val text = element.toString()
        return try {
            when {
                text.startsWith("{") -> JSONObject(text)
                text.startsWith("[") -> org.json.JSONArray(text)
                else -> org.json.JSONObject.wrap(
                    kotlinx.serialization.json.Json.parseToJsonElement(text).toString()
                ) ?: text
            }
        } catch (_: org.json.JSONException) {
            text
        }
    }

    /**
     * The bridge's real contract: a stable code plus `isRetryable`, so JS can
     * rebuild the typed error. Lose this and a kill switch becomes
     * indistinguishable from an outage.
     */
    private fun reject(call: PluginCall, err: Throwable) {
        if (err !is RevnixError) {
            call.reject(
                err.message ?: "unexpected failure", "network", Exception(err),
                JSObject().put("isRetryable", true),
            )
            return
        }
        val data = JSObject().put("isRetryable", err.isRetryable)
        val code = when (err) {
            is RevnixError.Network -> "network"
            is RevnixError.Timeout -> "timeout"
            is RevnixError.RateLimited -> {
                data.put("status", 429)
                err.retryAfterMs?.let { data.put("retryAfterMs", it) }
                "rate_limited"
            }
            is RevnixError.Server -> {
                data.put("status", err.status)
                "server"
            }
            is RevnixError.BadResponse -> "bad_response"
            is RevnixError.Auth -> {
                data.put("status", err.status)
                "auth"
            }
            is RevnixError.NotFound -> {
                data.put("status", 404)
                "not_found"
            }
            is RevnixError.PurchaseBlocked -> {
                data.put("status", 409)
                "purchase_blocked"
            }
            is RevnixError.Invalid -> {
                data.put("status", err.status)
                "invalid"
            }
        }
        call.reject(err.message, code, err, data)
    }
}
